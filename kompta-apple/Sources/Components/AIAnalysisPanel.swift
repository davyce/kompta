import SwiftUI

// ============================================================================
//  AIAnalysisPanel — a reusable Limule analysis card.
//  Renders the markdown-ish text the backend returns (bold/heading lines get
//  emphasised), with a loading state and a "run" button. Designed to be
//  dropped into any module that exposes an AI analysis: Investments, Teras,
//  Documents, Legislation, Safe Mode, etc.
// ============================================================================

/// Lightweight renderer for the `**bold**` / `# heading` markdown the Limule
/// endpoints emit. Thin wrapper over `MarkdownText` (see
/// `Components/MarkdownText.swift`) kept for API compatibility with existing
/// call sites across the app.
struct AIMarkdownText: View {
    let text: String
    var accent: Color = .green

    var body: some View {
        MarkdownText(text, accent: accent, bodySpacing: 6)
    }
}

/// Turns a Teras `result_snapshot` (a JSON string) into readable markdown-ish
/// prose for `AIAnalysisPanel`. Shared by the company + payroll + RH analyses.
enum TerasSnapshotFormatter {
    private struct Snapshot: Decodable {
        let domain: String?; let score: Int?; let confidence: Int?
        let maturity_level: String?; let summary: String?
        let recommendations: [String]?
    }
    static func readable(_ raw: String) -> String {
        guard let data = raw.data(using: .utf8),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return raw }
        var lines: [String] = []
        if let s = snap.summary, !s.isEmpty { lines.append(s) }
        if let m = snap.maturity_level, let sc = snap.score { lines.append("**Maturité : \(m.capitalized) — \(sc)/100**") }
        if let recs = snap.recommendations, !recs.isEmpty {
            lines.append("**Recommandations prioritaires**")
            lines.append(contentsOf: recs.map { "- " + $0 })
        }
        return lines.isEmpty ? raw : lines.joined(separator: "\n")
    }
}

/// A full analysis card: header with title + run button, then loading / content
/// / empty states. The parent owns `analysis` and `isLoading`.
struct AIAnalysisPanel: View {
    @EnvironmentObject private var theme: CompanyTheme

    let title: String
    var runLabel: String = "Analyser avec Limule"
    var loadingLabel: String = "Limule analyse en cours…"
    var emptyLabel: String = "Lancez une analyse pour obtenir l'avis de Limule."
    let analysis: String?
    let isLoading: Bool
    let onRun: () -> Void

    var body: some View {
        GlassCard(padding: 0, cornerRadius: theme.cardRadius) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Label {
                        Text(title)
                    } icon: {
                        LimuleMark(size: 20, showAura: false)
                    }
                    .font(.subheadline.bold())
                    .foregroundStyle(theme.primary)
                    Spacer()
                    Button(action: onRun) {
                        HStack(spacing: 6) {
                            if isLoading {
                                ProgressView().controlSize(.small).tint(.white)
                            } else {
                                LimuleMark(size: 16, showAura: false)
                            }
                            Text(isLoading ? "Analyse…" : runLabel).font(.caption.bold())
                        }
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(theme.primary, in: Capsule())
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                    .disabled(isLoading)
                }
                .padding(14)
                Divider()

                Group {
                    if isLoading {
                        HStack(spacing: 10) {
                            ProgressView().controlSize(.small)
                            Text(loadingLabel).font(.callout).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                    } else if let analysis, !analysis.isEmpty {
                        AIMarkdownText(text: analysis, accent: theme.primary)
                            .padding(16)
                    } else {
                        Text(emptyLabel)
                            .font(.callout).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 24).padding(.horizontal, 16)
                    }
                }
            }
        }
    }
}
