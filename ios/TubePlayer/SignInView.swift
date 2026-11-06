import SwiftUI
import WebKit

/// Google's normal sign-in page. The cookies it sets are shared with the player,
/// which is how a YouTube Premium account becomes ad-free in the app.
struct SignInView: View {
    @Environment(\.dismiss) private var dismiss

    private let signInURL = URL(string: "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fm.youtube.com%2F")!

    var body: some View {
        NavigationStack {
            SignInWebView(url: signInURL)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Sign in to YouTube")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
    }
}

struct SignInWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        let web = WKWebView(frame: .zero, configuration: config)
        web.customUserAgent = PlayerView.userAgent
        web.load(URLRequest(url: url))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
