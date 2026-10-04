// BoyGamesNativePlugin.kt — Get Clocked
//
// Capacitor plugin bridging window.BoyGamesNative (see STORE.md in the
// get-clocked website repo and plugins/native-bridge-shim.js).
//
//   store:   Play Billing v7 — getProducts / purchase / restore for the
//            non-consumable Remove Ads product.
//   haptics: Vibrator (VibrationEffect on API 26+).
//   ads:     STUBS — resolve immediately until AdMob IDs exist (see TODOs).
//
// SETUP (Android Studio, any machine):
//   1. Copy this file to
//      android/app/src/main/java/com/butterworks/getclocked/BoyGamesNativePlugin.kt
//      (package MUST match the appId in capacitor.config.ts).
//   2. In android/app/src/main/java/.../MainActivity.java (or .kt), register it:
//        import com.butterworks.getclocked.BoyGamesNativePlugin;
//        ...
//        @Override public void onCreate(Bundle savedInstanceState) {
//            registerPlugin(BoyGamesNativePlugin.class);
//            super.onCreate(savedInstanceState);
//        }
//   3. Add the Play Billing dependency to android/app/build.gradle:
//        implementation("com.android.billingclient:billing:7.1.1")
//      (Billing v8 changed enablePendingPurchases() — this plugin targets v7.)
//   4. OPTIONAL: copy ../native-bridge-shim.js to android/app/src/main/assets/
//      for the best-effort runtime injection in load(). The primary bridge
//      path is the static web/js/native-bridge.js copy (added by sync-web.sh).
//
// NOTE: written against the Play Billing v7 API from documentation — not
// compiled on this machine (no Android SDK here). First Gradle build on your
// machine is the real check.

package com.butterworks.getclocked

import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

// TODO(you, manual): register this EXACT product ID in Google Play Console as a
// one-time (non-consumable) in-app product at $2.99 (see README "Store products").
private const val REMOVE_ADS_PRODUCT_ID = "boygames.getclocked.remove_ads"

// localStorage key the web app reads for the Remove Ads entitlement (STORE.md)
private const val ENTITLEMENT_LS_KEY = "boygames.getclocked.entitlements"

@CapacitorPlugin(name = "BoyGamesNative")
class BoyGamesNativePlugin : Plugin(), PurchasesUpdatedListener {

    private var billing: BillingClient? = null
    private var productDetailsCache: ProductDetails? = null
    private var pendingPurchaseCall: PluginCall? = null

    // MARK: - lifecycle

    override fun load() {
        val bc = BillingClient.newBuilder(context)
            .setListener(this)
            .enablePendingPurchases()
            .build()
        billing = bc
        bc.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) { /* ready when result.responseCode == OK */ }
            override fun onBillingServiceDisconnected() { /* reconnected lazily by ensureConnected */ }
        })
        injectBridgeShim()
    }

    /// Best-effort runtime injection of the bridge shim. The PRIMARY path is
    /// the static web/js/native-bridge.js copy (added by sync-web.sh), which
    /// always runs before the app's scripts.
    private fun injectBridgeShim() {
        try {
            val src = context.assets.open("native-bridge-shim.js").bufferedReader().use { it.readText() }
            bridge?.eval(src, null)
        } catch (_: Exception) {
            // optional file — the static web/ copy covers this
        }
    }

    private fun ensureConnected(ready: () -> Unit) {
        val bc = billing ?: return
        if (bc.isReady) { ready(); return }
        bc.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) ready()
            }
            override fun onBillingServiceDisconnected() {}
        })
    }

    // MARK: - store (Play Billing)

    /// -> { products: [{id, title, price}] } ; price is the localized store string
    @PluginMethod
    fun getProducts(call: PluginCall) {
        val bc = billing ?: run { call.resolve(JSObject().put("products", JSArray())); return }
        ensureConnected {
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(REMOVE_ADS_PRODUCT_ID)
                            .setProductType(BillingClient.ProductType.INAPP)
                            .build()
                    )
                ).build()
            bc.queryProductDetailsAsync(params) { result, details ->
                val arr = JSArray()
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    details.productDetailsList.forEach { pd ->
                        productDetailsCache = pd
                        arr.put(
                            JSObject()
                                .put("id", pd.productId)
                                .put("title", pd.title)
                                .put("price", pd.oneTimePurchaseOfferDetails?.formattedPrice ?: "")
                        )
                    }
                }
                call.resolve(JSObject().put("products", arr))
            }
        }
    }

    /// -> { owned: Boolean }. Contract: user cancel / pending resolves
    /// {owned:false} — never rejects for a cancel.
    @PluginMethod
    fun purchase(call: PluginCall) {
        activity.runOnUiThread {
            val bc = billing
            val pd = productDetailsCache
            if (bc == null || pd == null) {
                call.resolve(JSObject().put("owned", false)); return@runOnUiThread
            }
            pendingPurchaseCall = call
            val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(
                    listOf(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(pd)
                            .build()
                    )
                ).build()
            bc.launchBillingFlow(activity, flowParams)
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        val call = pendingPurchaseCall ?: return
        pendingPurchaseCall = null
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                val p = purchases?.firstOrNull { it.products.contains(REMOVE_ADS_PRODUCT_ID) }
                if (p != null && p.purchaseState == Purchase.PurchaseState.PURCHASED) {
                    acknowledge(p)
                    refreshWebEntitlement()
                    call.resolve(JSObject().put("owned", true))
                } else {
                    // pending or empty: contract says resolve {owned:false}
                    call.resolve(JSObject().put("owned", false))
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED ->
                call.resolve(JSObject().put("owned", false))
            else ->
                call.resolve(JSObject().put("owned", false))
        }
    }

    /// -> { ownedIds: [String] }. Also refreshes the web localStorage
    /// entitlement cache (STORE.md).
    @PluginMethod
    fun restore(call: PluginCall) {
        val bc = billing ?: run { call.resolve(JSObject().put("ownedIds", JSArray())); return }
        ensureConnected {
            bc.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            ) { _, purchases ->
                val ids = JSArray()
                purchases.forEach { p ->
                    if (p.purchaseState == Purchase.PurchaseState.PURCHASED) {
                        if (!p.isAcknowledged) acknowledge(p)
                        p.products.forEach { id ->
                            if (id == REMOVE_ADS_PRODUCT_ID) ids.put(id)
                        }
                    }
                }
                if (ids.length() > 0) refreshWebEntitlement()
                call.resolve(JSObject().put("ownedIds", ids))
            }
        }
    }

    private fun acknowledge(purchase: Purchase) {
        val bc = billing ?: return
        bc.acknowledgePurchaseAsync(
            AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()
        ) { /* acknowledged */ }
    }

    /// Mirror the entitlement into the web app's localStorage cache so the
    /// web UI (which reads it synchronously) updates without a reload.
    private fun refreshWebEntitlement() {
        val js = "try{localStorage.setItem('$ENTITLEMENT_LS_KEY',JSON.stringify({remove_ads:true}))}catch(e){}"
        bridge?.eval(js, null)
    }

    // MARK: - haptics

    /// {style: "light"|"medium"|"heavy"} — one-shot vibration, scaled by style
    @PluginMethod
    fun impact(call: PluginCall) {
        val style = call.getString("style") ?: "light"
        vibrate(when (style) { "heavy" -> 60L; "medium" -> 40L; else -> 20L })
        call.resolve()
    }

    /// {type: "success"|"warning"|"error"}
    @PluginMethod
    fun notification(call: PluginCall) {
        val type = call.getString("type") ?: "success"
        vibrate(if (type == "error") 80L else 40L)
        call.resolve()
    }

    private fun vibrate(ms: Long) {
        try {
            val vib: Vibrator = if (Build.VERSION.SDK_INT >= 31) {
                context.getSystemService(VibratorManager::class.java).defaultVibrator
            } else {
                @Suppress("DEPRECATION") context.getSystemService(Vibrator::class.java)
            }
            if (Build.VERSION.SDK_INT >= 26) {
                vib.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION") vib.vibrate(ms)
            }
        } catch (_: Exception) { /* no vibrator — ignore */ }
    }

    // MARK: - ads (STUBS)

    // TODO(you, manual): AdMob — create your AdMob App ID and banner /
    // interstitial ad unit IDs at apps.admob.com (see README "AdMob"), add
    //   implementation("com.google.android.gms:play-services-ads:<version>")
    // to android/app/build.gradle plus the APPLICATION_ID meta-data to
    // AndroidManifest.xml, then implement:
    //   showBanner       -> AdView pinned under the webview
    //   hideBanner       -> remove the AdView
    //   showInterstitial -> InterstitialAd.load + show (native-side frequency
    //                       capping lives here too)
    // Until then these resolve immediately and show nothing.

    @PluginMethod
    fun showBanner(call: PluginCall) {
        // TODO: AdMob banner
        call.resolve()
    }

    @PluginMethod
    fun hideBanner(call: PluginCall) {
        // TODO: AdMob banner
        call.resolve()
    }

    @PluginMethod
    fun showInterstitial(call: PluginCall) {
        // TODO: AdMob interstitial (context = call.getString("context"))
        call.resolve()
    }
}
