//
//  FlashlyWidget.swift
//  Виджет «Вспомни слово» на экране блокировки (plan/widgets.md).
//
//  Пока заготовка (этап 0): три размера экрана блокировки и ссылка на урок дня.
//  Слова из приложения появятся в шагах 1.2 и 2.1.
//

import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> FlashlyEntry {
        FlashlyEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (FlashlyEntry) -> Void) {
        completion(FlashlyEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FlashlyEntry>) -> Void) {
        completion(Timeline(entries: [FlashlyEntry(date: Date())], policy: .never))
    }
}

struct FlashlyEntry: TimelineEntry {
    let date: Date
}

struct FlashlyWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: FlashlyEntry

    var body: some View {
        content
            .widgetURL(lessonURL)
            .lockScreenBackground()
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryInline:
            Label("Урок дня", systemImage: "bolt.fill")
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "bolt.fill")
                    .font(.system(size: 22, weight: .bold))
            }
        default:
            VStack(alignment: .leading, spacing: 2) {
                Label("FLASHLY", systemImage: "bolt.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .opacity(0.75)
                Text("Урок дня")
                    .font(.system(size: 17, weight: .bold))
                Text("Открой и начни")
                    .font(.system(size: 13))
                    .opacity(0.85)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var lessonURL: URL? {
        URL(string: "flashly://lesson?from=widget&state=stub&family=\(familyName)")
    }

    private var familyName: String {
        switch family {
        case .accessoryInline: return "accessoryInline"
        case .accessoryCircular: return "accessoryCircular"
        default: return "accessoryRectangular"
        }
    }
}

private extension View {
    /// iOS 17 требует containerBackground; на блокировке фон рисует система.
    @ViewBuilder
    func lockScreenBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { Color.clear }
        } else {
            self
        }
    }
}

struct FlashlyWidget: Widget {
    let kind: String = "FlashlyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            FlashlyWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Вспомни слово")
        .description("Слово и перевод из твоего словаря на экране блокировки.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}
