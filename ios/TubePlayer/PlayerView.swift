import SwiftUI
import WebKit

/// YouTube's own embedded player inside a web view.
/// Because the web view shares the app's cookies, a signed-in YouTube Premium account plays without ads.
struct PlayerView: UIViewRepresentable {
    let videoID: String

    /// A normal Safari identity, so YouTube and Google sign-in treat the app like Safari.
    static let userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        let web = WKWebView(frame: .zero, configuration: config)
        web.customUserAgent = Self.userAgent
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.isOpaque = false
        web.backgroundColor = .black
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        context.coordinator.load(videoID, in: web)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        if context.coordinator.loadedID != videoID {
            context.coordinator.load(videoID, in: web)
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var loadedID: String?

        func load(_ id: String, in web: WKWebView) {
            loadedID = id
            web.loadHTMLString(PlayerPage.html(videoID: id), baseURL: URL(string: "https://www.youtube.com"))
        }

        // Links tapped inside the player (channel name, "Watch on YouTube") open in Safari
        // instead of replacing the player with the YouTube website.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.targetFrame?.isMainFrame == true,
               navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url {
                UIApplication.shared.open(url)
            }
            return nil
        }
    }
}

enum PlayerPage {
    static func html(videoID: String) -> String {
        let page = #"""
        <!doctype html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <style>
          html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
          iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
        </style>
        </head>
        <body>
        <iframe src="https://www.youtube.com/embed/VIDEO_ID?playsinline=1&autoplay=1&rel=0&modestbranding=1"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
        </body>
        </html>
        """#
        return page.replacingOccurrences(of: "VIDEO_ID", with: videoID)
    }
}
