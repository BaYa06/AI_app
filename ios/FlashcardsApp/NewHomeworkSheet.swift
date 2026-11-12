//
//  NewHomeworkSheet.swift
//  Нативные окна «Новое задание» и «Слова для задания» (plan/new/teacher_cabinet.md, Teacher 20;
//  макеты 11 и 11а).
//
//  Повторяет RN-окна src/components/teacher/NewHomeworkSheet.tsx и WordPickerSheet.tsx.
//  Лист показывает UISheetPresentationController, как шторку режимов (StudyModeSheet.swift).
//  Логики сервера здесь нет: задание создаёт JS (newHomework.ts). Тексты, формы слов и цвета —
//  из JS; в Swift только раскладка, выбор и правило русского множественного числа.
//
//  Срок — системный барабан UIDatePicker (.wheels, дата + время, шаг 5 минут), как в «Будильнике»;
//  быстрые варианты над ним докручивают барабан сами (решение 3 этапа 2).
//
//  JS → present(options), setSets(sets), setBusy(Bool), setError(String?), finish(), dismiss().
//  Обратно — событие NewHomeworkSheetEvent:
//  { type: 'create', cardIds: [String], due: Double (мс), minScore: Int (-1 — без порога),
//    userIds: [String] или null }, { type: 'finished' }, { type: 'dismiss' }.
//

import SwiftUI
import UIKit

@objc(NewHomeworkSheetModule)
class NewHomeworkSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "NewHomeworkSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?
  private var model: HwModel?

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { [Self.eventName] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  private func emit(_ body: [String: Any]) {
    guard hasListeners else { return }
    sendEvent(withName: Self.eventName, body: body)
  }

  @objc(present:)
  func present(_ options: NSDictionary) {
    DispatchQueue.main.async { self.presentSheet(options) }
  }

  /// Наборы курса со словами приходят после открытия (юниты могут догружаться)
  @objc(setSets:)
  func setSets(_ sets: NSArray) {
    DispatchQueue.main.async {
      self.model?.setSets((sets as? [NSDictionary] ?? []).map(HwSet.init))
    }
  }

  @objc(setBusy:)
  func setBusy(_ busy: Bool) {
    DispatchQueue.main.async {
      self.model?.busy = busy
      self.presented?.isModalInPresentation = busy
    }
  }

  /// Ошибка создания — строкой над кнопкой (тост под листом не виден); nil — убрать
  @objc(setError:)
  func setError(_ message: NSString?) {
    DispatchQueue.main.async { self.model?.error = message as String? }
  }

  @objc func finish() {
    DispatchQueue.main.async {
      self.model = nil
      guard let host = self.presented, host.presentingViewController != nil else {
        self.presented = nil
        self.emit(["type": "finished"])
        return
      }
      self.presented = nil
      host.dismiss(animated: true) { self.emit(["type": "finished"]) }
    }
  }

  @objc func dismiss() {
    DispatchQueue.main.async {
      self.model = nil
      guard let sheet = self.presented, sheet.presentingViewController != nil, !sheet.isBeingDismissed else { return }
      self.presented = nil
      sheet.dismiss(animated: true)
    }
  }

  private func presentSheet(_ options: NSDictionary) {
    guard presented == nil, let top = RCTPresentedViewController() else { return }

    let palette = HwPalette(options["colors"] as? NSDictionary ?? [:])
    let model = HwModel(options: options, palette: palette)

    let host = UIHostingController(rootView: HwFormView(model: model))
    host.view.backgroundColor = palette.surface
    host.overrideUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light

    model.onCancel = { [weak self, weak host] in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      self.model = nil
      host.dismiss(animated: true) { self.emit(["type": "dismiss"]) }
    }
    model.onCreate = { [weak self, weak model] in
      guard let self, let model else { return }
      self.emit([
        "type": "create",
        "cardIds": model.selectedCardIds,
        "due": model.due.timeIntervalSince1970 * 1000,
        "minScore": model.minScore ?? -1,
        "userIds": model.pickAll ? (NSNull() as Any) : (Array(model.picked) as Any),
      ])
    }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      sheet.detents = [.large()]
      sheet.prefersGrabberVisible = true
      sheet.preferredCornerRadius = 24
      sheet.delegate = self
    }

    presented = host
    self.model = model
    top.present(host, animated: true)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard presentationController.presentedViewController === presented else { return }
    presented = nil
    model = nil
    emit(["type": "dismiss"])
  }
}

// MARK: - Данные

/// Русское множественное число: forms = [«слово», «слова», «слов»] — сами формы приходят из JS
func hwPlural(_ n: Int, _ forms: [String]) -> String {
  guard forms.count == 3 else { return forms.first ?? "" }
  let m10 = n % 10, m100 = n % 100
  if m100 >= 11 && m100 <= 19 { return forms[2] }
  if m10 == 1 { return forms[0] }
  if m10 >= 2 && m10 <= 4 { return forms[1] }
  return forms[2]
}

struct HwWord: Identifiable {
  let id: String
  let front: String
  let back: String
}

struct HwSet: Identifiable {
  let id: String
  let title: String
  let words: [HwWord]

  init(_ dict: NSDictionary) {
    id = dict["id"] as? String ?? ""
    title = dict["title"] as? String ?? ""
    words = (dict["words"] as? [NSDictionary] ?? []).map {
      HwWord(id: $0["id"] as? String ?? "", front: $0["front"] as? String ?? "", back: $0["back"] as? String ?? "")
    }
  }
}

struct HwStudent: Identifiable {
  let id: String
  let name: String
}

struct HwChoice: Identifiable {
  let id: String
  let label: String
  let sub: String
}

struct HwPreset: Identifiable {
  let id: String
  let label: String
  let date: Date
}

/// Тексты и формы слов из JS (NEW_HOMEWORK_TEXTS + WORD_PICKER_TEXTS + nativeTexts)
struct HwTexts {
  private let dict: NSDictionary
  init(_ dict: NSDictionary) { self.dict = dict }
  subscript(_ key: String) -> String { dict[key] as? String ?? "" }
  func forms(_ key: String) -> [String] { dict[key] as? [String] ?? [] }
}

struct HwPalette {
  let surface, surfaceMuted, border, borderLight: UIColor
  let textPrimary, textSecondary, textTertiary: UIColor
  let primary, primaryFill, onPrimary: UIColor
  let homework, homeworkText, warningText, errorText: UIColor

  init(_ dict: NSDictionary) {
    func color(_ key: String, _ fallback: UIColor) -> UIColor {
      guard let value = dict[key] else { return fallback }
      return RCTConvert.uiColor(value) ?? fallback
    }
    surface = color("surface", .systemBackground)
    surfaceMuted = color("surfaceMuted", .secondarySystemBackground)
    border = color("border", .separator)
    borderLight = color("borderLight", .separator)
    textPrimary = color("textPrimary", .label)
    textSecondary = color("textSecondary", .secondaryLabel)
    textTertiary = color("textTertiary", .tertiaryLabel)
    primary = color("primary", .systemIndigo)
    primaryFill = color("primaryFill", .systemIndigo)
    onPrimary = color("onPrimary", .white)
    homework = color("homework", .systemOrange)
    homeworkText = color("homeworkText", .systemOrange)
    warningText = color("warningText", .systemOrange)
    errorText = color("errorText", .systemRed)
  }
}

final class HwModel: ObservableObject {
  let texts: HwTexts
  let palette: HwPalette
  let courseTitle: String
  let students: [HwStudent]
  let tasks: [HwChoice]
  let scores: [Int]
  let presets: [HwPreset]
  let hasSchedule: Bool
  let minDate: Date
  let maxDate: Date
  let wordsPerSession: Int
  let minutesPerSession: Int
  let manyWords: Int
  let partWords: Int

  @Published var sets: [HwSet]?
  /// setId → выбранные слова
  @Published var selection: [String: Set<String>] = [:]
  @Published var pickAll = true
  @Published var picked: Set<String> = []
  @Published var task: String
  @Published var due: Date
  @Published var dueOpen = false
  /// nil — без порога
  @Published var minScore: Int?
  @Published var busy = false
  @Published var error: String?
  @Published var pickerOpen = false
  @Published var query = ""
  @Published var expanded: String?

  private var initialCardIds: Set<String>

  var onCreate: () -> Void = {}
  var onCancel: () -> Void = {}

  init(options: NSDictionary, palette: HwPalette) {
    func num(_ key: String, _ fallback: Double) -> Double { (options[key] as? NSNumber)?.doubleValue ?? fallback }
    func ms(_ value: Any?) -> Date { Date(timeIntervalSince1970: ((value as? NSNumber)?.doubleValue ?? 0) / 1000) }
    texts = HwTexts(options["texts"] as? NSDictionary ?? [:])
    self.palette = palette
    courseTitle = options["courseTitle"] as? String ?? ""
    students = (options["students"] as? [NSDictionary] ?? []).map {
      HwStudent(id: $0["id"] as? String ?? "", name: $0["name"] as? String ?? "")
    }
    tasks = (options["tasks"] as? [NSDictionary] ?? []).map {
      HwChoice(id: $0["key"] as? String ?? "", label: $0["title"] as? String ?? "", sub: $0["sub"] as? String ?? "")
    }
    scores = (options["scores"] as? [NSNumber] ?? []).map(\.intValue)
    presets = (options["presets"] as? [NSDictionary] ?? []).map {
      HwPreset(id: $0["key"] as? String ?? "", label: $0["label"] as? String ?? "", date: ms($0["date"]))
    }
    hasSchedule = options["hasSchedule"] as? Bool ?? false
    minDate = ms(options["minDate"])
    maxDate = ms(options["maxDate"])
    due = ms(options["due"])
    let score = (options["minScore"] as? NSNumber)?.intValue ?? -1
    minScore = score < 0 ? nil : score
    task = tasks.first?.id ?? "learn"
    wordsPerSession = Int(num("wordsPerSession", 5))
    minutesPerSession = Int(num("minutesPerSession", 7))
    manyWords = Int(num("manyWords", 30))
    partWords = Int(num("partWords", 25))
    initialCardIds = Set(options["cardIds"] as? [String] ?? [])
  }

  // MARK: Слова

  func setSets(_ list: [HwSet]) {
    sets = list
    var sel: [String: Set<String>] = [:]
    for s in list { sel[s.id] = Set(s.words.map(\.id).filter { initialCardIds.contains($0) }) }
    selection = sel
    expanded = list.first(where: { !(sel[$0.id]?.isEmpty ?? true) })?.id
  }

  var selectedCount: Int { selection.values.reduce(0) { $0 + $1.count } }

  /// По порядку наборов и слов — как toHomeworkWords в JS
  var selectedCardIds: [String] {
    (sets ?? []).flatMap { s in s.words.map(\.id).filter { selection[s.id]?.contains($0) ?? false } }
  }

  var usedSets: [HwSet] { (sets ?? []).filter { !(selection[$0.id]?.isEmpty ?? true) } }

  enum Check { case all, some, none }

  func check(_ set: HwSet) -> Check {
    let n = selection[set.id]?.count ?? 0
    if n == 0 { return .none }
    return n >= set.words.count ? .all : .some
  }

  func toggleSet(_ set: HwSet) {
    UISelectionFeedbackGenerator().selectionChanged()
    selection[set.id] = check(set) == .all ? [] : Set(set.words.map(\.id))
  }

  func toggleWord(_ setId: String, _ wordId: String) {
    UISelectionFeedbackGenerator().selectionChanged()
    var s = selection[setId] ?? []
    if s.contains(wordId) { s.remove(wordId) } else { s.insert(wordId) }
    selection[setId] = s
  }

  func takePart() {
    var left = partWords
    var out: [String: Set<String>] = [:]
    for s in sets ?? [] {
      var keep = Set<String>()
      for w in s.words where left > 0 && (selection[s.id]?.contains(w.id) ?? false) {
        keep.insert(w.id)
        left -= 1
      }
      out[s.id] = keep
    }
    selection = out
  }

  func shownWords(_ set: HwSet) -> [HwWord] {
    let q = query.trimmingCharacters(in: .whitespaces).lowercased()
    if q.isEmpty { return set.words }
    return set.words.filter { $0.front.lowercased().contains(q) || $0.back.lowercased().contains(q) }
  }

  // MARK: Подписи

  func words(_ n: Int) -> String { "\(n) \(hwPlural(n, texts.forms("wordForms")))" }

  var setsTitle: String {
    let used = usedSets
    guard let first = used.first else { return "" }
    return used.count == 1 ? first.title : "\(first.title) \(texts["moreSets"]) \(used.count - 1)"
  }

  var wordsSummary: String {
    let n = selectedCount
    if n == 0 { return texts["wordsPick"] }
    return setsTitle.isEmpty ? words(n) : "\(setsTitle) · \(words(n))"
  }

  func volume(_ n: Int) -> String {
    guard n > 0 else { return "" }
    let sessions = (n + wordsPerSession - 1) / wordsPerSession
    return "≈ \(sessions) \(hwPlural(sessions, texts.forms("sessionForms"))) · ≈ \(sessions * minutesPerSession) \(texts["minutes"])"
  }

  func setSubtitle(_ set: HwSet) -> String {
    let total = set.words.count
    let n = selection[set.id]?.count ?? 0
    let w = hwPlural(total, texts.forms("wordForms"))
    if n == 0 { return "\(total) \(w)" }
    if n >= total { return "\(texts["allPrefix"]) \(total) \(w)" }
    return "\(n) \(texts["ofWord"]) \(total) \(w)"
  }

  var studentCount: Int { pickAll ? students.count : picked.count }

  var assignTitle: String {
    "\(texts["assign"]) \(studentCount) \(hwPlural(studentCount, texts.forms("studentDative")))"
  }

  var duePast: Bool { due <= Date() }

  var dueText: String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "ru_RU")
    f.dateFormat = "EE, dd.MM.yyyy HH:mm"
    let s = f.string(from: due)
    return "\(texts["duePrefix"]) \(s.prefix(1).uppercased())\(s.dropFirst())"
  }

  private func daysUntil(_ date: Date) -> Int {
    let cal = Calendar.current
    return cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: date)).day ?? 0
  }

  var dueRelative: String {
    if duePast { return texts["duePast"] }
    let d = daysUntil(due)
    if d <= 0 { return texts["today"].lowercased() }
    if d == 1 { return texts["dueTomorrow"].lowercased() }
    return "\(texts["inPrefix"]) \(d) \(hwPlural(d, texts.forms("dayForms")))"
  }

  /// Плашка «Много к сроку»; nil — не показывать
  var tooMany: String? {
    let n = selectedCount
    guard n > manyWords else { return nil }
    let perDay = (n + max(1, daysUntil(due)) - 1) / max(1, daysUntil(due))
    return "\(texts["manyPrefix"]) \(words(perDay)) \(texts["manySuffix"])"
  }

  var canCreate: Bool { selectedCount > 0 && studentCount > 0 && !duePast && !busy }

  func togglePicked(_ id: String) {
    UISelectionFeedbackGenerator().selectionChanged()
    if picked.contains(id) { picked.remove(id) } else { picked.insert(id) }
  }

  func pickPreset(_ p: HwPreset) {
    UISelectionFeedbackGenerator().selectionChanged()
    due = p.date
  }
}

// MARK: - Вид

/// Отступы и скругления — токены из src/constants/spacing.ts
private enum M {
  static let xxs: CGFloat = 4
  static let xs: CGFloat = 8
  static let s: CGFloat = 12
  static let m: CGFloat = 16
  static let l: CGFloat = 24
  static let radiusS: CGFloat = 8
  static let radiusM: CGFloat = 12
  static let radiusL: CGFloat = 16
  static let touch: CGFloat = 44
  static let button: CGFloat = 52
}

private struct HwPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
  }
}

/// Системный барабан даты и времени, как в «Будильнике»; setDate(animated:) докручивает его сам
struct HwWheelPicker: UIViewRepresentable {
  @Binding var date: Date
  let minDate: Date
  let maxDate: Date
  let tint: UIColor

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIView(context: Context) -> UIDatePicker {
    let picker = UIDatePicker()
    picker.datePickerMode = .dateAndTime
    picker.preferredDatePickerStyle = .wheels
    picker.minuteInterval = 5
    picker.locale = Locale(identifier: "ru_RU")
    picker.tintColor = tint
    picker.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .valueChanged)
    return picker
  }

  func updateUIView(_ picker: UIDatePicker, context: Context) {
    context.coordinator.parent = self
    picker.minimumDate = minDate
    picker.maximumDate = maxDate
    if abs(picker.date.timeIntervalSince(date)) > 1 { picker.setDate(date, animated: true) }
  }

  final class Coordinator: NSObject {
    var parent: HwWheelPicker
    init(_ parent: HwWheelPicker) { self.parent = parent }
    @objc func changed(_ picker: UIDatePicker) {
      UISelectionFeedbackGenerator().selectionChanged()
      parent.date = picker.date
    }
  }
}

struct HwFormView: View {
  @ObservedObject var model: HwModel
  private var p: HwPalette { model.palette }
  private var t: HwTexts { model.texts }

  var body: some View {
    VStack(spacing: 0) {
      header(t["title"], close: model.onCancel)
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: M.l) {
          whoSection
          wordsSection
          taskSection
          dueSection
          scoreSection
        }
        .padding(.horizontal, M.m)
        .padding(.bottom, M.l)
      }
      footer
    }
    .background(Color(p.surface).ignoresSafeArea())
    .disabled(model.busy)
    .sheet(isPresented: $model.pickerOpen) {
      HwPickerView(model: model)
    }
  }

  private func header(_ title: String, close: @escaping () -> Void) -> some View {
    HStack(spacing: M.xs) {
      Text(title)
        .font(.system(size: 20, weight: .semibold))
        .foregroundColor(Color(p.textPrimary))
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      Button(action: close) {
        Image(systemName: "xmark")
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(p.textSecondary))
          .frame(width: 36, height: 36)
          .background(Circle().fill(Color(p.surfaceMuted)))
          .frame(width: M.touch, height: M.touch)
          .contentShape(Rectangle())
      }
      .buttonStyle(HwPress())
      .accessibilityLabel(t["close"])
    }
    .padding(.horizontal, M.m)
    .padding(.top, M.l)
    .padding(.bottom, M.s)
  }

  private var whoSection: some View {
    VStack(alignment: .leading, spacing: M.xs) {
      label(t["whoLabel"])
      if model.students.isEmpty {
        caption(t["noStudents"], color: p.warningText)
      } else {
        HwRow(
          symbol: "person.2",
          title: "\(t["whoAll"]) \(model.courseTitle) · \(model.students.count) \(hwPlural(model.students.count, t.forms("studentForms")))",
          subtitle: "",
          selected: model.pickAll,
          palette: p
        ) { model.pickAll = true }
        HwRow(
          symbol: "person.crop.circle.badge.checkmark",
          title: t["whoPick"],
          subtitle: !model.pickAll && !model.picked.isEmpty ? "\(t["pickedPrefix"]) \(model.picked.count)" : "",
          selected: !model.pickAll,
          palette: p
        ) { model.pickAll = false }
        if !model.pickAll {
          ForEach(model.students) { s in
            HwRow(symbol: nil, title: s.name, subtitle: "", selected: model.picked.contains(s.id), palette: p) {
              model.togglePicked(s.id)
            }
            .padding(.leading, M.l)
          }
        }
      }
    }
  }

  private var wordsSection: some View {
    VStack(alignment: .leading, spacing: M.xs) {
      label(t["wordsLabel"])
      Button { model.pickerOpen = true } label: {
        HStack(spacing: M.s) {
          Image(systemName: "book")
            .font(.system(size: 18, weight: .medium))
            .foregroundColor(Color(p.textSecondary))
            .frame(width: 24)
          VStack(alignment: .leading, spacing: 2) {
            Text(model.wordsSummary)
              .font(.system(size: 16))
              .foregroundColor(Color(p.textPrimary))
            if model.selectedCount > 0 {
              Text(model.volume(model.selectedCount))
                .font(.system(size: 12))
                .foregroundColor(Color(p.textSecondary))
            }
          }
          Spacer(minLength: 0)
          Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color(p.textTertiary))
        }
        .padding(.horizontal, M.m)
        .frame(minHeight: 56)
        .background(RoundedRectangle(cornerRadius: M.radiusM).fill(Color(p.surface)))
        .overlay(RoundedRectangle(cornerRadius: M.radiusM).strokeBorder(Color(p.border), lineWidth: 1))
        .contentShape(Rectangle())
      }
      .buttonStyle(HwPress())
    }
  }

  private var taskSection: some View {
    VStack(alignment: .leading, spacing: M.xs) {
      label(t["taskLabel"])
      ForEach(model.tasks) { task in
        HwRow(
          symbol: nil,
          title: task.label,
          subtitle: task.id == "learn" ? model.wordsSummary : task.sub,
          selected: model.task == task.id,
          palette: p
        ) { model.task = task.id }
      }
    }
  }

  private var dueSection: some View {
    VStack(alignment: .leading, spacing: M.xs) {
      label(t["dueLabel"])
      VStack(spacing: 0) {
        Button {
          withAnimation(.easeInOut(duration: 0.25)) { model.dueOpen.toggle() }
        } label: {
          HStack(spacing: M.s) {
            Image(systemName: "clock")
              .font(.system(size: 18, weight: .medium))
              .foregroundColor(Color(p.homeworkText))
              .frame(width: 40, height: 40)
              .background(RoundedRectangle(cornerRadius: M.radiusM).fill(Color(p.homework.withAlphaComponent(0.1))))
            VStack(alignment: .leading, spacing: 2) {
              Text(model.dueText)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(p.homeworkText))
              Text(model.dueRelative)
                .font(.system(size: 14))
                .foregroundColor(Color(model.duePast ? p.errorText : p.textSecondary))
            }
            Spacer(minLength: 0)
            Image(systemName: model.dueOpen ? "chevron.up" : "chevron.down")
              .font(.system(size: 14, weight: .semibold))
              .foregroundColor(Color(p.textTertiary))
          }
          .padding(.horizontal, M.m)
          .frame(minHeight: 64)
          .contentShape(Rectangle())
        }
        .buttonStyle(HwPress())
        if model.dueOpen {
          Rectangle().fill(Color(p.border)).frame(height: 1)
          VStack(spacing: M.xs) {
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: M.xs) {
                ForEach(model.presets) { preset in
                  HwChip(label: preset.label, selected: abs(preset.date.timeIntervalSince(model.due)) < 1, palette: p) {
                    model.pickPreset(preset)
                  }
                }
              }
              .padding(.horizontal, M.m)
            }
            HwWheelPicker(date: $model.due, minDate: model.minDate, maxDate: model.maxDate, tint: p.primary)
              .frame(height: 216)
              .padding(.horizontal, M.xs)
          }
          .padding(.vertical, M.s)
        }
      }
      .background(RoundedRectangle(cornerRadius: M.radiusL).fill(Color(p.surface)))
      .overlay(RoundedRectangle(cornerRadius: M.radiusL).strokeBorder(Color(p.border), lineWidth: 1))
      .clipShape(RoundedRectangle(cornerRadius: M.radiusL))
      if !model.hasSchedule {
        caption(t["noScheduleHint"], color: p.textSecondary)
      }
    }
  }

  private var scoreSection: some View {
    VStack(alignment: .leading, spacing: M.xs) {
      label(t["scoreLabel"])
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: M.xs) {
          ForEach(model.scores, id: \.self) { score in
            HwChip(
              label: score < 0 ? t["scoreNone"] : "\(score)%",
              selected: (model.minScore ?? -1) == score,
              palette: p
            ) { model.minScore = score < 0 ? nil : score }
          }
        }
      }
      caption(t["scoreHint"], color: p.textSecondary)
    }
  }

  private var footer: some View {
    VStack(spacing: M.xs) {
      Rectangle().fill(Color(p.border)).frame(height: 1)
      if let error = model.error {
        Text(error)
          .font(.system(size: 14))
          .foregroundColor(Color(p.errorText))
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, M.m)
      }
      Button { model.onCreate() } label: {
        ZStack {
          if model.busy {
            ProgressView().tint(Color(p.onPrimary))
          } else {
            Text(model.assignTitle)
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(Color(p.onPrimary))
          }
        }
        .frame(maxWidth: .infinity, minHeight: M.button)
        .background(RoundedRectangle(cornerRadius: M.radiusM).fill(Color(p.primaryFill)))
      }
      .buttonStyle(HwPress())
      .disabled(!model.canCreate)
      .opacity(model.canCreate || model.busy ? 1 : 0.5)
      .padding(.horizontal, M.m)
      .padding(.bottom, M.s)
      .accessibilityLabel(model.assignTitle)
    }
    .background(Color(p.surface))
  }

  private func label(_ text: String) -> some View {
    Text(text)
      .font(.system(size: 14, weight: .semibold))
      .foregroundColor(Color(p.textSecondary))
  }

  private func caption(_ text: String, color: UIColor) -> some View {
    Text(text)
      .font(.system(size: 12))
      .foregroundColor(Color(color))
      .fixedSize(horizontal: false, vertical: true)
  }
}

/// «Слова для задания» — второй лист поверх формы (макет 11а)
struct HwPickerView: View {
  @ObservedObject var model: HwModel
  @Environment(\.dismiss) private var dismiss
  private var p: HwPalette { model.palette }
  private var t: HwTexts { model.texts }

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: M.xs) {
        Text(t["pickerTitle"])
          .font(.system(size: 20, weight: .semibold))
          .foregroundColor(Color(p.textPrimary))
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        Button { dismiss() } label: {
          Image(systemName: "xmark")
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(Color(p.textSecondary))
            .frame(width: 36, height: 36)
            .background(Circle().fill(Color(p.surfaceMuted)))
            .frame(width: M.touch, height: M.touch)
        }
        .buttonStyle(HwPress())
        .accessibilityLabel(t["close"])
      }
      .padding(.horizontal, M.m)
      .padding(.top, M.l)
      .padding(.bottom, M.s)

      HStack(spacing: M.xs) {
        Image(systemName: "magnifyingglass").foregroundColor(Color(p.textTertiary))
        TextField(t["search"], text: $model.query)
          .font(.system(size: 16))
          .foregroundColor(Color(p.textPrimary))
      }
      .padding(.horizontal, M.s)
      .frame(minHeight: 40)
      .background(RoundedRectangle(cornerRadius: M.radiusM).fill(Color(p.surfaceMuted)))
      .padding(.horizontal, M.m)
      .padding(.bottom, M.s)

      ScrollView(showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: M.xs) {
          Text(t["setsLabel"])
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color(p.textSecondary))
          if let sets = model.sets {
            if sets.isEmpty {
              Text(t["empty"]).foregroundColor(Color(p.textSecondary))
            }
            ForEach(sets) { set in
              let words = model.shownWords(set)
              if model.query.isEmpty || !words.isEmpty {
                setCard(set, words: words)
              }
            }
          } else {
            ProgressView().tint(Color(p.primary)).frame(maxWidth: .infinity).padding(.vertical, M.l)
          }
          Text(t["footnote"])
            .font(.system(size: 12))
            .foregroundColor(Color(p.textSecondary))
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, M.m)
        .padding(.bottom, M.l)
      }

      VStack(spacing: M.s) {
        Rectangle().fill(Color(p.border)).frame(height: 1)
        if let many = model.tooMany {
          HStack(spacing: M.s) {
            (Text(t["manyTitle"]).fontWeight(.semibold).foregroundColor(Color(p.homeworkText))
              + Text(" \(many)").foregroundColor(Color(p.textPrimary)))
              .font(.system(size: 14))
              .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button { model.takePart() } label: {
              Text(t["takePart"])
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Color(p.homeworkText))
                .padding(.horizontal, M.s)
                .frame(minHeight: 36)
                .background(Capsule().fill(Color(p.surface)))
                .overlay(Capsule().strokeBorder(Color(p.homework), lineWidth: 1))
            }
            .buttonStyle(HwPress())
          }
          .padding(M.s)
          .background(RoundedRectangle(cornerRadius: M.radiusL).fill(Color(p.homework.withAlphaComponent(0.1))))
          .padding(.horizontal, M.m)
        }
        HStack(spacing: M.s) {
          VStack(alignment: .leading, spacing: 2) {
            Text("\(t["selectedPrefix"]) \(model.words(model.selectedCount))")
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(Color(p.textPrimary))
            Text(model.selectedCount == 0 ? t["pickHint"] : model.volume(model.selectedCount))
              .font(.system(size: 14))
              .foregroundColor(Color(p.textSecondary))
          }
          Spacer(minLength: 0)
          Button { dismiss() } label: {
            Text(t["done"])
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(Color(p.onPrimary))
              .padding(.horizontal, M.l)
              .frame(minHeight: M.button)
              .background(RoundedRectangle(cornerRadius: M.radiusM).fill(Color(p.primaryFill)))
          }
          .buttonStyle(HwPress())
          .disabled(model.selectedCount == 0)
          .opacity(model.selectedCount == 0 ? 0.5 : 1)
        }
        .padding(.horizontal, M.m)
        .padding(.bottom, M.s)
      }
      .background(Color(p.surface))
    }
    .background(Color(p.surface).ignoresSafeArea())
  }

  private func setCard(_ set: HwSet, words: [HwWord]) -> some View {
    let check = model.check(set)
    let open = !model.query.isEmpty || model.expanded == set.id
    return VStack(spacing: 0) {
      HStack(spacing: 0) {
        Button { model.toggleSet(set) } label: {
          HwBox(state: check == .all ? 1 : check == .some ? 2 : 0, size: 24, palette: p)
            .frame(width: M.touch, height: M.touch)
        }
        .buttonStyle(HwPress())
        .accessibilityLabel("\(check == .all ? t["clearAll"] : t["selectAll"]) \(set.title)")
        Button {
          withAnimation(.easeInOut(duration: 0.2)) { model.expanded = model.expanded == set.id ? nil : set.id }
        } label: {
          HStack(spacing: M.xs) {
            VStack(alignment: .leading, spacing: 2) {
              Text(set.title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(p.textPrimary))
              Text(model.setSubtitle(set))
                .font(.system(size: 14))
                .foregroundColor(Color(check == .none ? p.textSecondary : p.primary))
            }
            Spacer(minLength: 0)
            Image(systemName: open ? "chevron.up" : "chevron.down")
              .font(.system(size: 14, weight: .semibold))
              .foregroundColor(Color(p.textTertiary))
          }
          .frame(minHeight: 56)
          .padding(.trailing, M.s)
          .contentShape(Rectangle())
        }
        .buttonStyle(HwPress())
      }
      .padding(.leading, M.xxs)
      if open {
        Rectangle().fill(Color(p.border)).frame(height: 1)
        ForEach(words) { w in
          let on = model.selection[set.id]?.contains(w.id) ?? false
          Button { model.toggleWord(set.id, w.id) } label: {
            HStack(spacing: M.s) {
              HwBox(state: on ? 1 : 0, size: 22, palette: p)
              (Text(w.front).fontWeight(.semibold).foregroundColor(Color(p.textPrimary))
                + Text(" — \(w.back)").foregroundColor(Color(p.textSecondary)))
                .font(.system(size: 16))
                .lineLimit(2)
              Spacer(minLength: 0)
            }
            .padding(.horizontal, M.s)
            .frame(minHeight: M.touch)
            .contentShape(Rectangle())
          }
          .buttonStyle(HwPress())
          .accessibilityAddTraits(on ? .isSelected : [])
        }
      }
    }
    .background(RoundedRectangle(cornerRadius: M.radiusL).fill(Color(p.surface)))
    .overlay(
      RoundedRectangle(cornerRadius: M.radiusL)
        .strokeBorder(Color(check == .none ? p.border : p.primary), lineWidth: check == .none ? 1 : 2)
    )
    .clipShape(RoundedRectangle(cornerRadius: M.radiusL))
  }
}

/// Галочка: 0 — пусто, 1 — выбрано, 2 — часть
private struct HwBox: View {
  let state: Int
  let size: CGFloat
  let palette: HwPalette

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: M.radiusS)
        .fill(Color(state == 0 ? palette.surface : palette.primaryFill))
      RoundedRectangle(cornerRadius: M.radiusS)
        .strokeBorder(Color(state == 0 ? palette.border : palette.primaryFill), lineWidth: 2)
      if state != 0 {
        Image(systemName: state == 2 ? "minus" : "checkmark")
          .font(.system(size: size * 0.5, weight: .heavy))
          .foregroundColor(Color(palette.onPrimary))
      }
    }
    .frame(width: size, height: size)
  }
}

/// Строка с галочкой выбора (как ListRow в RN-окне)
private struct HwRow: View {
  let symbol: String?
  let title: String
  let subtitle: String
  let selected: Bool
  let palette: HwPalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: M.s) {
        if let symbol {
          Image(systemName: symbol)
            .font(.system(size: 18, weight: .medium))
            .foregroundColor(Color(selected ? palette.primary : palette.textSecondary))
            .frame(width: 24)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.system(size: 16))
            .foregroundColor(Color(palette.textPrimary))
            .lineLimit(2)
          if !subtitle.isEmpty {
            Text(subtitle)
              .font(.system(size: 12))
              .foregroundColor(Color(palette.textSecondary))
              .lineLimit(2)
          }
        }
        Spacer(minLength: 0)
        Image(systemName: "checkmark")
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(palette.primary))
          .opacity(selected ? 1 : 0)
      }
      .padding(.horizontal, M.m)
      .frame(minHeight: 52)
      .background(
        RoundedRectangle(cornerRadius: M.radiusM)
          .fill(Color(selected ? palette.primary.withAlphaComponent(0.1) : palette.surface))
      )
      .overlay(
        RoundedRectangle(cornerRadius: M.radiusM)
          .strokeBorder(Color(selected ? palette.primary.withAlphaComponent(0.4) : palette.border), lineWidth: 1)
      )
      .contentShape(RoundedRectangle(cornerRadius: M.radiusM))
    }
    .buttonStyle(HwPress())
    .accessibilityLabel(subtitle.isEmpty ? title : "\(title). \(subtitle)")
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/// Быстрый вариант срока / порог — как Chip в RN-окне
private struct HwChip: View {
  let label: String
  let selected: Bool
  let palette: HwPalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(label)
        .font(.system(size: 14, weight: .semibold))
        .lineLimit(1)
        .foregroundColor(Color(selected ? palette.onPrimary : palette.textPrimary))
        .padding(.horizontal, M.s)
        .frame(minHeight: 36)
        .background(Capsule().fill(Color(selected ? palette.primaryFill : palette.surfaceMuted)))
    }
    .buttonStyle(HwPress())
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
