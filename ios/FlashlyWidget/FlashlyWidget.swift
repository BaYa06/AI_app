//
//  FlashlyWidget.swift
//  Виджет «Вспомни слово» на экране блокировки (plan/widgets.md).
//
//  Виджет ничего не решает: приложение (WidgetPlanner.ts) заранее кладёт в App Group расписание
//  на 72 часа, а виджет показывает последнюю запись, время которой уже наступило.
//  На экране блокировки iOS сама красит виджет в один цвет, поэтому работаем жирностью и размером.
//

import WidgetKit
import SwiftUI

// MARK: - Снимок от приложения (формат — WidgetSnapshot в src/services/WidgetPlanner.ts)

struct WidgetSnapshot: Decodable {
  let version: Int
  let generatedAt: Double
  let entries: [SnapshotEntry]
}

struct SnapshotEntry: Decodable {
  let at: Double
  let state: String
  let phase: String?
  let reverse: Bool?
  let prompt: String?
  let answer: String?
  let cardId: String?
  let setId: String?
  let waiting: Int
  let newCount: Int
  let minutes: Int
  let streak: Int
  let hoursLeft: Int?
  let done: Int
  let total: Int
  let fading: Int

  var isAnswer: Bool { phase == "answer" }
  var hasWord: Bool { prompt != nil && answer != nil }
}

enum SnapshotStore {
  static let appGroup = "group.com.baiirbek.flashly"
  static let snapshotKey = "widgetSnapshot"

  static func load() -> WidgetSnapshot? {
    guard
      let json = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
      let data = json.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }
}

// MARK: - Расписание

struct FlashlyEntry: TimelineEntry {
  let date: Date
  /// nil — снимка нет (новая установка, выход из аккаунта, ещё нет слов)
  let item: SnapshotEntry?
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> FlashlyEntry {
    FlashlyEntry(date: Date(), item: Self.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (FlashlyEntry) -> Void) {
    if context.isPreview {
      completion(FlashlyEntry(date: Date(), item: Self.sample))
      return
    }
    completion(Self.timelineEntries(now: Date()).first ?? FlashlyEntry(date: Date(), item: nil))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<FlashlyEntry>) -> Void) {
    // Новое расписание приходит от приложения (reloadAllTimelines), сами не перезапрашиваем
    completion(Timeline(entries: Self.timelineEntries(now: Date()), policy: .never))
  }

  /// Текущая запись (последняя наступившая) и все будущие
  static func timelineEntries(now: Date) -> [FlashlyEntry] {
    guard let snapshot = SnapshotStore.load(), !snapshot.entries.isEmpty else {
      return [FlashlyEntry(date: now, item: nil)]
    }
    let nowMs = now.timeIntervalSince1970 * 1000
    let sorted = snapshot.entries.sorted { $0.at < $1.at }
    let currentIndex = sorted.lastIndex { $0.at <= nowMs } ?? 0
    return sorted[currentIndex...].map { item in
      FlashlyEntry(date: Date(timeIntervalSince1970: max(item.at, nowMs) / 1000), item: item)
    }
  }

  /// Для галереи виджетов: как выглядит закрепление
  static let sample = SnapshotEntry(
    at: 0, state: "review", phase: "question", reverse: false, prompt: "resilient", answer: "стойкий",
    cardId: nil, setId: nil, waiting: 0, newCount: 0, minutes: 0, streak: 14, hoursLeft: nil,
    done: 18, total: 18, fading: 0
  )
}

// MARK: - Тексты

enum Copy {
  /// 1 слово, 2 слова, 5 слов
  static func plural(_ n: Int, _ one: String, _ few: String, _ many: String) -> String {
    let mod10 = n % 10, mod100 = n % 100
    if mod10 == 1 && mod100 != 11 { return one }
    if (2...4).contains(mod10) && !(12...14).contains(mod100) { return few }
    return many
  }

  static func words(_ n: Int) -> String { "\(n) \(plural(n, "слово", "слова", "слов"))" }
  static func days(_ n: Int) -> String { "\(n) \(plural(n, "день", "дня", "дней"))" }
  static func minutes(_ n: Int) -> String { "~\(max(1, n)) мин" }
  static func waits(_ n: Int) -> String { plural(n, "ждёт", "ждут", "ждут") }
  static func fades(_ n: Int) -> String { plural(n, "забывается", "забываются", "забываются") }

  /// Сколько работы в уроке: «7 слов ждут» или «10 новых слов»
  static func lessonTitle(_ item: SnapshotEntry) -> String {
    if item.waiting > 0 { return "\(words(item.waiting)) \(waits(item.waiting))" }
    return "\(item.newCount) \(plural(item.newCount, "новое слово", "новых слова", "новых слов"))"
  }
}

// MARK: - Вид

struct FlashlyWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family
  var entry: FlashlyEntry

  var body: some View {
    content
      .widgetURL(url)
      .lockScreenBackground()
  }

  @ViewBuilder
  private var content: some View {
    switch family {
    case .accessoryInline:
      Label(inlineText, systemImage: "bolt.fill")
    case .accessoryCircular:
      CircularView(item: entry.item)
    default:
      RectangularView(item: entry.item)
    }
  }

  private var inlineText: String {
    guard let item = entry.item else { return "Открой Flashly" }
    if item.hasWord, let prompt = item.prompt, let answer = item.answer {
      return item.isAnswer ? "\(prompt) — \(answer)" : "\(prompt) → ?"
    }
    switch item.state {
    case "first": return "Первый урок · \(Copy.minutes(item.minutes))"
    case "waiting": return Copy.lessonTitle(item)
    case "streak": return "Серия \(item.streak) — до 00:00"
    case "stale": return item.fading > 0 ? "\(Copy.words(item.fading)) \(Copy.fades(item.fading))" : "Слова ждут"
    default: return "Сегодня \(Copy.words(item.done)) ✓"
    }
  }

  private var url: URL? {
    let familyName = String(describing: family)
    guard let item = entry.item else { return URL(string: "flashly://lesson?from=widget&state=noData&family=\(familyName)") }
    if item.state == "review", let setId = item.setId,
       let encoded = setId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) {
      return URL(string: "flashly://set/\(encoded)?from=widget&state=review&family=\(familyName)")
    }
    return URL(string: "flashly://lesson?from=widget&state=\(item.state)&family=\(familyName)")
  }
}

/// Прямоугольник — главный размер: метка, крупная строка, подпись
struct RectangularView: View {
  let item: SnapshotEntry?

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      Label(overline, systemImage: "bolt.fill")
        .font(.system(size: 11, weight: .semibold))
        .opacity(0.75)
      Text(title)
        .font(.system(size: 17, weight: .bold))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(subtitle)
        .font(.system(size: 13))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .opacity(0.85)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var overline: String {
    guard let item = item else { return "FLASHLY" }
    switch item.state {
    case "first": return "ПЕРВЫЙ УРОК"
    case "waiting": return "УРОК ДНЯ"
    case "streak": return "СЕРИЯ \(item.streak)"
    case "review" where item.hasWord: return item.isAnswer ? "ОТВЕТ" : "ВСПОМНИ"
    case "stale": return "FLASHLY"
    default: return "СЕГОДНЯ"
    }
  }

  private var title: String {
    guard let item = item else { return "Открой Flashly" }
    switch item.state {
    case "first": return "\(item.newCount) \(Copy.plural(item.newCount, "новое слово", "новых слова", "новых слов"))"
    case "waiting": return Copy.lessonTitle(item)
    case "streak": return "Успей до 00:00"
    case "review" where item.hasWord: return item.prompt ?? ""
    case "stale": return item.fading > 0 ? "\(Copy.words(item.fading)) \(Copy.fades(item.fading))" : "Слова ждут"
    default: return item.done > 0 ? "\(Copy.words(item.done)) ✓" : "Отдыхай"
    }
  }

  private var subtitle: String {
    guard let item = item else { return "чтобы учить слова здесь" }
    switch item.state {
    case "first", "waiting": return Copy.minutes(item.minutes)
    case "streak": return "\(Copy.words(item.waiting + item.newCount)) · \(Copy.minutes(item.minutes))"
    case "review" where item.hasWord:
      if item.isAnswer { return item.answer ?? "" }
      return item.reverse == true ? "как это будет?" : "как это перевести?"
    case "stale": return "открой урок дня"
    case "night": return item.streak > 0 ? "серия \(Copy.days(item.streak))" : "до завтра"
    default: return "урок дня пройден"
    }
  }
}

/// Круг: до урока — кольцо прогресса дня, после — галочка и серия
struct CircularView: View {
  let item: SnapshotEntry?

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      if let item = item, ["first", "waiting", "streak"].contains(item.state) {
        ProgressRing(progress: item.total > 0 ? Double(item.done) / Double(item.total) : 0)
        VStack(spacing: 0) {
          Text("\(item.waiting > 0 ? item.waiting : item.newCount)")
            .font(.system(size: 18, weight: .bold))
            .minimumScaleFactor(0.6)
          Text(item.waiting > 0 ? Copy.waits(item.waiting) : "новых")
            .font(.system(size: 9, weight: .semibold))
            .opacity(0.8)
        }
      } else if let item = item, item.state == "stale", item.fading > 0 {
        VStack(spacing: 0) {
          Text("\(item.fading)").font(.system(size: 18, weight: .bold)).minimumScaleFactor(0.6)
          Image(systemName: "bolt.fill").font(.system(size: 9, weight: .semibold))
        }
      } else if let item = item, item.state == "review" || item.state == "night" {
        VStack(spacing: 0) {
          Image(systemName: "checkmark").font(.system(size: 18, weight: .bold))
          if item.streak > 0 {
            Text("\(item.streak)").font(.system(size: 11, weight: .semibold)).opacity(0.8)
          }
        }
      } else {
        Image(systemName: "bolt.fill").font(.system(size: 22, weight: .bold))
      }
    }
  }
}

struct ProgressRing: View {
  let progress: Double

  var body: some View {
    ZStack {
      Circle().stroke(lineWidth: 4).opacity(0.25)
      Circle()
        .trim(from: 0, to: min(max(progress, 0), 1))
        .stroke(style: StrokeStyle(lineWidth: 4, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
    .padding(3)
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

// MARK: - Виджет

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
