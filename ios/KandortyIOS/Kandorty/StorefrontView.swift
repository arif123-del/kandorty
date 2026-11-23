import SwiftUI
import WebKit
import UIKit

private let kandortyURL = URL(string: "https://kandorty.online/")!

struct StorefrontView: View {
    @StateObject private var browser = StoreBrowser()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("Kandorty")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                ShareLink(item: kandortyURL) {
                    Image(systemName: "square.and.arrow.up")
                        .frame(width: 32, height: 40)
                }
                .accessibilityLabel("مشاركة المتجر")
            }
            .padding(.horizontal, 16)
            .frame(height: 48)

            ZStack {
                StoreWebView(browser: browser)
                    .background(Color(.systemBackground))

                if browser.isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .padding(16)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel("جاري تحميل المتجر")
                }

                if browser.hasNetworkError {
                    VStack(spacing: 14) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 36))
                        Text("تعذر الاتصال بالمتجر")
                            .font(.headline)
                        Text("تحققي من اتصال الإنترنت، ثم حاولي مجددًا.")
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                        Button("إعادة المحاولة") { browser.reloadHome() }
                            .buttonStyle(.borderedProminent)
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.systemBackground))
                }
            }

            HStack(spacing: 24) {
                Button(action: browser.goBack) {
                    Image(systemName: "chevron.backward")
                }
                .disabled(!browser.canGoBack)
                .accessibilityLabel("رجوع")
                Spacer()
                Button(action: browser.goForward) {
                    Image(systemName: "chevron.forward")
                }
                .disabled(!browser.canGoForward)
                .accessibilityLabel("التالي")
                Spacer()
                Button(action: browser.goHome) {
                    Image(systemName: "house")
                }
                .accessibilityLabel("الرئيسية")
                Spacer()
                Button(action: browser.refresh) {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("تحديث")
            }
            .font(.system(size: 20, weight: .medium))
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(Color(.secondarySystemBackground))
        }
        .tint(Color(red: 0.65, green: 0.0, blue: 0.1))
    }
}

struct StoreWebView: UIViewRepresentable {
    let browser: StoreBrowser

    func makeUIView(context: Context) -> WKWebView {
        browser.webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

final class StoreBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = true
    @Published var hasNetworkError = false

    // Persistent WebKit storage retains the customer's session and cart.
    lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.keyboardDismissMode = .interactive
        view.load(URLRequest(url: kandortyURL, cachePolicy: .useProtocolCachePolicy))
        return view
    }()

    func goBack() { if webView.canGoBack { webView.goBack() } }
    func goForward() { if webView.canGoForward { webView.goForward() } }
    func goHome() { webView.load(URLRequest(url: kandortyURL)) }
    func refresh() {
        if hasNetworkError { reloadHome() }
        else { webView.reload() }
    }
    func reloadHome() {
        hasNetworkError = false
        isLoading = true
        goHome()
    }

    private func updateNavigation(_ view: WKWebView) {
        canGoBack = view.canGoBack
        canGoForward = view.canGoForward
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        hasNetworkError = false
        updateNavigation(webView)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isLoading = false
        hasNetworkError = false
        updateNavigation(webView)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        isLoading = false
        hasNetworkError = (error as NSError).code != NSURLErrorCancelled
        updateNavigation(webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        isLoading = false
        updateNavigation(webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isLoading = false
        hasNetworkError = true
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = (url.scheme ?? "").lowercased()
        if scheme == "https" || scheme == "http" || scheme == "about" || scheme == "blob" || scheme == "data" {
            // Checkout redirects stay in this WebView; iOS payment return requires testing.
            decisionHandler(.allow)
        } else {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }
}
