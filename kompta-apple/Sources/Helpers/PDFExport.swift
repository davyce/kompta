import Foundation
import WebKit

// ============================================================================
//  HTMLToPDF — renders backend-provided HTML (invoices, receipts) into a real
//  A4 PDF document, so it can be downloaded, shared and printed natively.
// ============================================================================

@MainActor
final class HTMLToPDF: NSObject, WKNavigationDelegate {
    private var webView: WKWebView!
    private var continuation: CheckedContinuation<Data?, Never>?

    /// A4 at 72 dpi (points).
    private static let a4 = CGRect(x: 0, y: 0, width: 595, height: 842)

    func render(html: String) async -> Data? {
        await withCheckedContinuation { (cont: CheckedContinuation<Data?, Never>) in
            self.continuation = cont
            self.webView = WKWebView(frame: Self.a4)
            self.webView.navigationDelegate = self
            self.webView.loadHTMLString(html, baseURL: nil)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Let layout settle, then snapshot to PDF.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            guard let self else { return }
            let config = WKPDFConfiguration()
            webView.createPDF(configuration: config) { result in
                switch result {
                case .success(let data): self.continuation?.resume(returning: data)
                case .failure:           self.continuation?.resume(returning: nil)
                }
                self.continuation = nil
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        continuation?.resume(returning: nil); continuation = nil
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        continuation?.resume(returning: nil); continuation = nil
    }
}

/// Convenience: fetch invoice HTML from the backend and turn it into a PDF file
/// in the temp directory, returning its URL.
@MainActor
func exportInvoicePDF(invoiceId: Int, number: String) async -> URL? {
    guard let data = try? await APIClient.shared.invoiceExportHTML(invoiceId),
          let html = String(data: data, encoding: .utf8) else { return nil }
    guard let pdf = await HTMLToPDF().render(html: html) else { return nil }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(number).pdf")
    try? pdf.write(to: url, options: .atomic)
    return url
}
