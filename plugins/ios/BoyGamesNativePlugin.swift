// BoyGamesNativePlugin.swift — Get Clocked
//
// Capacitor plugin bridging window.BoyGamesNative (see STORE.md in the
// get-clocked website repo and plugins/native-bridge-shim.js).
//
//   store:   StoreKit 2 — getProducts / purchase / restore for the
//            non-consumable Remove Ads product.
//   haptics: UIImpactFeedbackGenerator + UINotificationFeedbackGenerator.
//   ads:     STUBS — resolve immediately until AdMob IDs exist (see TODOs).
//
// SETUP (Xcode, on your Mac):
//   1. File > Add Files to "App…": add THIS file to the App target.
//   2. File > Add Files to "App…": add ../native-bridge-shim.js to the App
//      target (tick "Copy items if needed" — it lands in Copy Bundle Resources).
//      load() injects it into the WKWebView at document-start, before any
//      page script runs. (The web/ snapshot also carries a static copy as a
//      backup; the shim is idempotent.)
//
// NOTE: written against the StoreKit 2 API from documentation — not compiled
// on this machine (no Xcode here). First `npx cap open ios` build on your Mac
// is the real check.

import Foundation
import Capacitor
import StoreKit
import UIKit
import WebKit

// TODO(you, manual): register this EXACT product ID in App Store Connect as a
// non-consumable In-App Purchase at $2.99 (see README "Store products").
private let REMOVE_ADS_PRODUCT_ID = "boygames.getclocked.remove_ads"

// localStorage key the web app reads for the Remove Ads entitlement (STORE.md)
private let ENTITLEMENT_LS_KEY = "boygames.getclocked.entitlements"

@objc(BoyGamesNativePlugin)
public class BoyGamesNativePlugin: CAPPlugin {

    // MARK: - lifecycle

    public override func load() {
        injectBridgeShim()
        // Finish any transactions that completed while the app was closed.
        Task { await self.listenForTransactions() }
    }

    /// Inject plugins/native-bridge-shim.js at document-start so
    /// window.BoyGamesNative exists before any page script runs.
    private func injectBridgeShim() {
        guard let url = Bundle.main.url(forResource: "native-bridge-shim", withExtension: "js"),
              let src = try? String(contentsOf: url, encoding: .utf8) else {
            print("[BoyGamesNative] native-bridge-shim.js not in bundle — relying on the static web/ copy")
            return
        }
        let script = WKUserScript(source: src, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        self.bridge?.webView?.configuration.userContentController.addUserScript(script)
    }

    // MARK: - store (StoreKit 2)

    /// -> { products: [{id, title, price}] } ; price is the localized store string
    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: [REMOVE_ADS_PRODUCT_ID])
                let arr = products.map { p -> [String: String] in
                    ["id": p.id, "title": p.displayName, "price": p.displayPrice]
                }
                call.resolve(["products": arr])
            } catch {
                // Store unreachable: empty catalog; the web side falls back gracefully.
                call.resolve(["products": []])
            }
        }
    }

    /// -> { owned: Bool }. Contract: user cancel / pending resolves
    /// {owned:false} — never rejects for a cancel.
    @objc func purchase(_ call: CAPPluginCall) {
        let productId = call.getString("productId") ?? REMOVE_ADS_PRODUCT_ID
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.resolve(["owned": false])
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    let transaction = try self.checked(verification)
                    await transaction.finish()
                    self.refreshWebEntitlement(owned: true)
                    call.resolve(["owned": true])
                case .userCancelled, .pending:
                    call.resolve(["owned": false])
                @unknown default:
                    call.resolve(["owned": false])
                }
            } catch {
                call.reject("purchase failed: \(error.localizedDescription)")
            }
        }
    }

    /// -> { ownedIds: [String] } via Transaction.currentEntitlements.
    /// Also refreshes the web localStorage entitlement cache (STORE.md).
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            var owned: [String] = []
            for await result in Transaction.currentEntitlements {
                guard case .verified(let transaction) = result else { continue }
                if transaction.productID == REMOVE_ADS_PRODUCT_ID {
                    owned.append(transaction.productID)
                }
            }
            self.refreshWebEntitlement(owned: !owned.isEmpty)
            call.resolve(["ownedIds": owned])
        }
    }

    /// Listen for transactions that complete outside the purchase() call
    /// (e.g. App Store server notifications) and finish them.
    private func listenForTransactions() async {
        for await result in Transaction.updates {
            guard case .verified(let transaction) = result else { continue }
            await transaction.finish()
            if transaction.productID == REMOVE_ADS_PRODUCT_ID {
                self.refreshWebEntitlement(owned: true)
            }
        }
    }

    /// Mirror the entitlement into the web app's localStorage cache so the
    /// web UI (which reads it synchronously) updates without a reload.
    private func refreshWebEntitlement(owned: Bool) {
        guard owned else { return }
        let js = "try{localStorage.setItem('\(ENTITLEMENT_LS_KEY)',JSON.stringify({remove_ads:true}))}catch(e){}"
        DispatchQueue.main.async {
            self.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func checked<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified: throw NSError(domain: "BoyGamesNative", code: 1,
                                        userInfo: [NSLocalizedDescriptionKey: "unverified transaction"])
        case .verified(let safe): return safe
        }
    }

    // MARK: - haptics

    /// {style: "light"|"medium"|"heavy"} — UIImpactFeedbackGenerator
    @objc func impact(_ call: CAPPluginCall) {
        let style = call.getString("style") ?? "light"
        DispatchQueue.main.async {
            let gen: UIImpactFeedbackGenerator
            switch style {
            case "medium": gen = UIImpactFeedbackGenerator(style: .medium)
            case "heavy": gen = UIImpactFeedbackGenerator(style: .heavy)
            default: gen = UIImpactFeedbackGenerator(style: .light)
            }
            gen.impactOccurred()
            call.resolve()
        }
    }

    /// {type: "success"|"warning"|"error"} — UINotificationFeedbackGenerator
    @objc func notification(_ call: CAPPluginCall) {
        let type = call.getString("type") ?? "success"
        DispatchQueue.main.async {
            let gen = UINotificationFeedbackGenerator()
            switch type {
            case "error": gen.notificationOccurred(.error)
            case "warning": gen.notificationOccurred(.warning)
            default: gen.notificationOccurred(.success)
            }
            call.resolve()
        }
    }

    // MARK: - ads (STUBS)

    // TODO(you, manual): AdMob — create your AdMob App ID and banner /
    // interstitial ad unit IDs at apps.admob.com (see README "AdMob"), add
    // the Google-Mobile-Ads SDK via Swift Package Manager, then implement:
    //   showBanner      -> GADBannerView pinned under the webview
    //   hideBanner      -> remove the banner view
    //   showInterstitial-> GADInterstitialAd.load + present (native-side
    //                      frequency capping lives here too)
    // Until then these resolve immediately and show nothing.

    @objc func showBanner(_ call: CAPPluginCall) {
        // TODO: AdMob banner
        call.resolve()
    }

    @objc func hideBanner(_ call: CAPPluginCall) {
        // TODO: AdMob banner
        call.resolve()
    }

    @objc func showInterstitial(_ call: CAPPluginCall) {
        // TODO: AdMob interstitial (context = call.getString("context"))
        call.resolve()
    }
}
