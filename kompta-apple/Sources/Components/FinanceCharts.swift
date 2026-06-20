import SwiftUI
import Charts

// ============================================================================
//  Wave 5 — Reusable finance charts
//  Cashflow (grouped bars) + Expenses (donut). Shared by Comptabilité,
//  Analytique and any module that surfaces CashFlowPoint / ExpenseCategory.
// ============================================================================

/// Grouped inflow/outflow bars over time. Values are shown in K FCFA for
/// legibility. Renders nothing when there is no data.
struct CashFlowChart: View {
    let points: [CashFlowPoint]

    private struct Bar: Identifiable {
        let id = UUID(); let label: String; let type: String; let kValue: Double
    }
    private var data: [Bar] {
        points.suffix(8).flatMap { p -> [Bar] in
            var bars: [Bar] = []
            if p.inflow != 0 { bars.append(Bar(label: p.label, type: "Entrées", kValue: p.inflow / 1_000)) }
            if p.outflow != 0 { bars.append(Bar(label: p.label, type: "Sorties", kValue: p.outflow / 1_000)) }
            return bars
        }
    }

    var body: some View {
        if data.isEmpty { EmptyView() } else {
            Chart(data) { bar in
                BarMark(x: .value("Période", bar.label), y: .value("K FCFA", bar.kValue), width: .fixed(22))
                    .foregroundStyle(by: .value("Type", bar.type))
                    .position(by: .value("Type", bar.type), span: .ratio(0.6))
                    .cornerRadius(4)
            }
            .chartForegroundStyleScale(["Entrées": Color.green, "Sorties": Color.red])
            .chartLegend(position: .topTrailing)
            .chartYAxisLabel("K FCFA", alignment: .trailing)
            .frame(height: 180)
        }
    }
}

/// Expense breakdown as a donut. Slices use the backend-provided hex colors,
/// falling back to a palette. Renders nothing when there is no data.
struct ExpenseDonutChart: View {
    let expenses: [ExpenseCategory]

    private var top: [ExpenseCategory] { Array(expenses.sorted { $0.amount > $1.amount }.prefix(6)) }
    private var total: Double { top.reduce(0) { $0 + $1.amount } }

    var body: some View {
        if top.isEmpty || total <= 0 { EmptyView() } else {
            HStack(alignment: .center, spacing: 16) {
                Chart(top) { e in
                    SectorMark(
                        angle: .value("Montant", e.amount),
                        innerRadius: .ratio(0.6),
                        angularInset: 1.5
                    )
                    .cornerRadius(3)
                    .foregroundStyle(Color(hex: e.color) ?? .gray)
                }
                .frame(width: 130, height: 130)

                VStack(alignment: .leading, spacing: 6) {
                    ForEach(top) { e in
                        HStack(spacing: 8) {
                            Circle().fill(Color(hex: e.color) ?? .gray).frame(width: 9, height: 9)
                            Text(e.name).font(.caption).lineLimit(1)
                            Spacer(minLength: 8)
                            Text("\(Int(e.amount / total * 100))%")
                                .font(.caption.bold()).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
