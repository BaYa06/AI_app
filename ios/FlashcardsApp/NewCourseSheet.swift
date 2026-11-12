//
//  NewCourseSheet.swift
//  Нативное окно «Новый курс» учителя (plan/new/teacher_cabinet.md, Teacher 7).
//
//  Повторяет RN-окно src/components/teacher/NewCourseSheet.tsx: название, учебник, дни уроков и время.
//  Лист показывает UISheetPresentationController, как шторку режимов (StudyModeSheet.swift).
//  Логики здесь нет: курс, учебник и расписание сохраняет JS (newCourse.ts), тексты и цвета
//  приходят из JS.
//
//  JS → present(options), setBooks(books), setBusy(Bool), finish(), dismiss().
//  Обратно — событие NewCourseSheetEvent:
//  { type: 'create', title, bookId (или null), days: [String], minutes: Int },
//  { type: 'finished' } — лист закрылся после finish(), { type: 'dismiss' } — закрыли без создания.
//

import SwiftUI
import UIKit

@objc(NewCourseSheetModule)
class NewCourseSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "NewCourseSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?
  private var model: NewCourseModel?

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

  /// Учебники приходят после открытия: окно не ждёт сеть
  @objc(setBooks:)
  func setBooks(_ books: NSArray) {
    DispatchQueue.main.async {
      self.model?.books = (books as? [NSDictionary] ?? []).map(NewCourseBook.init)
    }
  }

  /// Пока JS создаёт курс: кнопка с индикатором, поля и закрытие недоступны
  @objc(setBusy:)
  func setBusy(_ busy: Bool) {
    DispatchQueue.main.async {
      self.model?.busy = busy
      self.presented?.isModalInPresentation = busy
    }
  }

  /// Курс создан — закрыть и сообщить, когда лист уже ушёл (JS покажет тост и код подключения)
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

    func int(_ value: Any?, _ fallback: Int) -> Int { (value as? NSNumber)?.intValue ?? fallback }

    let palette = NewCoursePalette(options["colors"] as? NSDictionary ?? [:])
    let time = options["time"] as? NSDictionary ?? [:]
    let days = (options["days"] as? [NSDictionary] ?? []).map {
      NewCourseDay(key: $0["key"] as? String ?? "", label: $0["label"] as? String ?? "")
    }
    let model = NewCourseModel(
      texts: NewCourseTexts(options["texts"] as? NSDictionary ?? [:]),
      days: days,
      minutes: int(time["default"], 18 * 60),
      minMinutes: int(time["min"], 7 * 60),
      maxMinutes: int(time["max"], 22 * 60),
      step: int(time["step"], 15),
      searchFrom: int(options["searchFrom"], 6),
      palette: palette
    )

    let host = UIHostingController(rootView: NewCourseView(model: model))
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
        "title": model.trimmedTitle,
        "bookId": model.bookId.map { $0 as Any } ?? NSNull(),
        "days": model.selectedDays,
        "minutes": model.minutes,
      ])
    }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      // Форма с полем ввода и списком учебников — сразу во весь экран
      sheet.detents = [.large()]
      sheet.prefersGrabberVisible = true
      sheet.preferredCornerRadius = 24
      sheet.delegate = self
    }

    presented = host
    self.model = model
    top.present(host, animated: true)
  }

  // Закрыли жестом (свайп вниз)
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard presentationController.presentedViewController === presented else { return }
    presented = nil
    model = nil
    emit(["type": "dismiss"])
  }
}

// MARK: - Данные

struct NewCourseBook: Identifiable {
  let id: String
  let title: String
  let subtitle: String

  init(_ dict: NSDictionary) {
    id = dict["id"] as? String ?? ""
    title = dict["title"] as? String ?? ""
    subtitle = dict["subtitle"] as? String ?? ""
  }
}

struct NewCourseDay: Identifiable {
  let key: String
  let label: String
  var id: String { key }
}

/// Тексты окна — из JS; здесь только запасные на случай, если ключа нет
struct NewCourseTexts {
  let title, close, nameLabel, namePlaceholder: String
  let bookLabel, noBook, noBookHint, bookSearch, bookHint: String
  let daysLabel, daysHint, earlier, later, startsAt, create: String

  init(_ dict: NSDictionary) {
    func text(_ key: String, _ fallback: String) -> String { dict[key] as? String ?? fallback }
    title = text("title", "Новый курс")
    close = text("close", "Закрыть")
    nameLabel = text("nameLabel", "Название группы")
    namePlaceholder = text("namePlaceholder", "Например: A1-C")
    bookLabel = text("bookLabel", "Учебник")
    noBook = text("noBook", "Без учебника")
    noBookHint = text("noBookHint", "Свои наборы или из библиотеки")
    bookSearch = text("bookSearch", "Найти учебник")
    bookHint = text("bookHint", "")
    daysLabel = text("daysLabel", "Дни уроков")
    daysHint = text("daysHint", "")
    earlier = text("earlier", "Раньше на 15 минут")
    later = text("later", "Позже на 15 минут")
    startsAt = text("startsAt", "Начало в")
    create = text("create", "Создать курс")
  }
}

/// Токены темы из JS (useThemeColors, переданы через processColor)
struct NewCoursePalette {
  let surface: UIColor
  let surfaceMuted: UIColor
  let border: UIColor
  let textPrimary: UIColor
  let textSecondary: UIColor
  let textTertiary: UIColor
  let primary: UIColor
  let primaryFill: UIColor
  let onPrimary: UIColor

  init(_ dict: NSDictionary) {
    func color(_ key: String, _ fallback: UIColor) -> UIColor {
      guard let value = dict[key] else { return fallback }
      return RCTConvert.uiColor(value) ?? fallback
    }
    surface = color("surface", .systemBackground)
    surfaceMuted = color("surfaceMuted", .secondarySystemBackground)
    border = color("border", .separator)
    textPrimary = color("textPrimary", .label)
    textSecondary = color("textSecondary", .secondaryLabel)
    textTertiary = color("textTertiary", .tertiaryLabel)
    primary = color("primary", .systemIndigo)
    primaryFill = color("primaryFill", .systemIndigo)
    onPrimary = color("onPrimary", .white)
  }
}

final class NewCourseModel: ObservableObject {
  let texts: NewCourseTexts
  let days: [NewCourseDay]
  let minMinutes: Int
  let maxMinutes: Int
  let step: Int
  let searchFrom: Int
  let palette: NewCoursePalette

  @Published var title = ""
  /// nil — пока грузятся
  @Published var books: [NewCourseBook]?
  @Published var bookId: String?
  @Published var bookQuery = ""
  @Published var selected: Set<String> = []
  @Published var minutes: Int
  @Published var busy = false

  var onCreate: () -> Void = {}
  var onCancel: () -> Void = {}

  init(
    texts: NewCourseTexts,
    days: [NewCourseDay],
    minutes: Int,
    minMinutes: Int,
    maxMinutes: Int,
    step: Int,
    searchFrom: Int,
    palette: NewCoursePalette
  ) {
    self.texts = texts
    self.days = days
    self.minutes = minutes
    self.minMinutes = minMinutes
    self.maxMinutes = maxMinutes
    self.step = step
    self.searchFrom = searchFrom
    self.palette = palette
  }

  var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
  var canCreate: Bool { !trimmedTitle.isEmpty && !busy }
  /// В порядке недели, как в JS
  var selectedDays: [String] { days.map(\.key).filter { selected.contains($0) } }
  var timeText: String { String(format: "%02d:%02d", minutes / 60, minutes % 60) }

  var shownBooks: [NewCourseBook] {
    guard let books else { return [] }
    let q = bookQuery.trimmingCharacters(in: .whitespaces).lowercased()
    return q.isEmpty ? books : books.filter { $0.title.lowercased().contains(q) }
  }

  func toggle(_ day: String) {
    UISelectionFeedbackGenerator().selectionChanged()
    if selected.contains(day) { selected.remove(day) } else { selected.insert(day) }
  }

  func shift(_ delta: Int) {
    minutes = min(maxMinutes, max(minMinutes, minutes + delta))
  }

  func pickBook(_ id: String?) {
    UISelectionFeedbackGenerator().selectionChanged()
    bookId = id
  }
}

// MARK: - Вид

/// Отступы и скругления — токены из src/constants/spacing.ts
private enum Metrics {
  static let xxs: CGFloat = 4
  static let xs: CGFloat = 8
  static let s: CGFloat = 12
  static let m: CGFloat = 16
  static let l: CGFloat = 24
  static let radiusM: CGFloat = 12
  static let radiusL: CGFloat = 16
  static let touch: CGFloat = 44
  static let input: CGFloat = 48
  static let button: CGFloat = 52
}

struct NewCourseView: View {
  @ObservedObject var model: NewCourseModel
  @FocusState private var nameFocused: Bool
  private var p: NewCoursePalette { model.palette }
  private var t: NewCourseTexts { model.texts }

  var body: some View {
    VStack(spacing: 0) {
      header
      ScrollView(showsIndicators: false) {
        VStack(alignment: .leading, spacing: Metrics.l) {
          nameField
          bookSection
          daysSection
        }
        .padding(.horizontal, Metrics.m)
        .padding(.bottom, Metrics.l)
      }
      footer
    }
    .background(Color(p.surface).ignoresSafeArea())
    .disabled(model.busy)
    .onAppear {
      // Клавиатура сразу — название единственное обязательное поле
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { nameFocused = true }
    }
  }

  private var header: some View {
    HStack(spacing: Metrics.xs) {
      Text(t.title)
        .font(.system(size: 20, weight: .semibold))
        .foregroundColor(Color(p.textPrimary))
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      Button { model.onCancel() } label: {
        Image(systemName: "xmark")
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(p.textSecondary))
          .frame(width: 36, height: 36)
          .background(Circle().fill(Color(p.surfaceMuted)))
          .frame(width: Metrics.touch, height: Metrics.touch)
          .contentShape(Rectangle())
      }
      .buttonStyle(PressableStyle())
      .accessibilityLabel(t.close)
    }
    .padding(.horizontal, Metrics.m)
    .padding(.top, Metrics.l)
    .padding(.bottom, Metrics.s)
  }

  private var nameField: some View {
    VStack(alignment: .leading, spacing: Metrics.xs) {
      sectionLabel(t.nameLabel)
      TextField(t.namePlaceholder, text: $model.title)
        .font(.system(size: 16))
        .foregroundColor(Color(p.textPrimary))
        .focused($nameFocused)
        .submitLabel(.done)
        .padding(.horizontal, Metrics.s)
        .frame(minHeight: Metrics.input)
        .background(RoundedRectangle(cornerRadius: Metrics.radiusM).fill(Color(p.surface)))
        .overlay(
          RoundedRectangle(cornerRadius: Metrics.radiusM)
            .strokeBorder(Color(nameFocused ? p.primary : p.border), lineWidth: nameFocused ? 1.5 : 1)
        )
        .accessibilityLabel(t.nameLabel)
    }
  }

  private var bookSection: some View {
    VStack(alignment: .leading, spacing: Metrics.xs) {
      sectionLabel(t.bookLabel)
      BookRow(
        symbol: "circle.slash",
        title: t.noBook,
        subtitle: t.noBookHint,
        selected: model.bookId == nil,
        palette: p
      ) { model.pickBook(nil) }
      if let books = model.books {
        if books.count > model.searchFrom {
          HStack(spacing: Metrics.xs) {
            Image(systemName: "magnifyingglass")
              .foregroundColor(Color(p.textTertiary))
            TextField(t.bookSearch, text: $model.bookQuery)
              .font(.system(size: 16))
              .foregroundColor(Color(p.textPrimary))
          }
          .padding(.horizontal, Metrics.s)
          .frame(minHeight: Metrics.input)
          .background(RoundedRectangle(cornerRadius: Metrics.radiusM).fill(Color(p.surfaceMuted)))
        }
        ForEach(model.shownBooks) { book in
          BookRow(
            symbol: "book",
            title: book.title,
            subtitle: book.subtitle,
            selected: model.bookId == book.id,
            palette: p
          ) { model.pickBook(book.id) }
        }
      } else {
        ProgressView()
          .tint(Color(p.primary))
          .frame(maxWidth: .infinity)
          .padding(.vertical, Metrics.s)
      }
      if !t.bookHint.isEmpty {
        caption(t.bookHint)
      }
    }
  }

  private var daysSection: some View {
    VStack(alignment: .leading, spacing: Metrics.xs) {
      sectionLabel(t.daysLabel)
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Metrics.xs), count: 7), spacing: Metrics.xs) {
        ForEach(model.days) { day in
          DayChip(label: day.label, selected: model.selected.contains(day.key), palette: p) {
            model.toggle(day.key)
          }
        }
      }
      if model.selected.isEmpty {
        if !t.daysHint.isEmpty { caption(t.daysHint) }
      } else {
        HStack(spacing: Metrics.m) {
          stepButton("chevron.down", label: t.earlier) { model.shift(-model.step) }
          Text(model.timeText)
            .font(.system(size: 24, weight: .bold).monospacedDigit())
            .foregroundColor(Color(p.textPrimary))
            .accessibilityLabel("\(t.startsAt) \(model.timeText)")
          stepButton("chevron.up", label: t.later) { model.shift(model.step) }
        }
        .frame(maxWidth: .infinity)
      }
    }
  }

  private var footer: some View {
    VStack(spacing: 0) {
      Rectangle().fill(Color(p.border)).frame(height: 1)
      Button { model.onCreate() } label: {
        ZStack {
          if model.busy {
            ProgressView().tint(Color(p.onPrimary))
          } else {
            Text(t.create)
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(Color(p.onPrimary))
          }
        }
        .frame(maxWidth: .infinity, minHeight: Metrics.button)
        .background(RoundedRectangle(cornerRadius: Metrics.radiusM).fill(Color(p.primaryFill)))
      }
      .buttonStyle(PressableStyle())
      .disabled(!model.canCreate)
      .opacity(model.canCreate || model.busy ? 1 : 0.5)
      .padding(.horizontal, Metrics.m)
      .padding(.top, Metrics.s)
      .padding(.bottom, Metrics.s)
      .accessibilityLabel(t.create)
    }
    .background(Color(p.surface))
  }

  private func sectionLabel(_ text: String) -> some View {
    Text(text)
      .font(.system(size: 14, weight: .semibold))
      .foregroundColor(Color(p.textSecondary))
  }

  private func caption(_ text: String) -> some View {
    Text(text)
      .font(.system(size: 12))
      .foregroundColor(Color(p.textSecondary))
      .fixedSize(horizontal: false, vertical: true)
  }

  private func stepButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 18, weight: .semibold))
        .foregroundColor(Color(p.textSecondary))
        .frame(width: Metrics.touch, height: Metrics.touch)
        .contentShape(Rectangle())
    }
    .buttonStyle(PressableStyle())
    .accessibilityLabel(label)
  }
}

/// Нажатие — прозрачность 0.85, как у Pressable в RN
private struct PressableStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
  }
}

/// Строка учебника с галочкой выбора (как ListRow в RN-окне)
private struct BookRow: View {
  let symbol: String
  let title: String
  let subtitle: String
  let selected: Bool
  let palette: NewCoursePalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Metrics.s) {
        Image(systemName: symbol)
          .font(.system(size: 18, weight: .medium))
          .foregroundColor(Color(selected ? palette.primary : palette.textSecondary))
          .frame(width: 24)
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.system(size: 16))
            .foregroundColor(Color(palette.textPrimary))
            .lineLimit(2)
          if !subtitle.isEmpty {
            Text(subtitle)
              .font(.system(size: 12))
              .foregroundColor(Color(palette.textSecondary))
              .lineLimit(1)
          }
        }
        Spacer(minLength: 0)
        Image(systemName: "checkmark")
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(palette.primary))
          .opacity(selected ? 1 : 0)
      }
      .padding(.horizontal, Metrics.m)
      .frame(minHeight: 52)
      .background(
        RoundedRectangle(cornerRadius: Metrics.radiusM)
          .fill(Color(selected ? palette.primary.withAlphaComponent(0.1) : palette.surface))
      )
      .overlay(
        RoundedRectangle(cornerRadius: Metrics.radiusM)
          .strokeBorder(Color(selected ? palette.primary.withAlphaComponent(0.4) : palette.border), lineWidth: 1)
      )
      .contentShape(RoundedRectangle(cornerRadius: Metrics.radiusM))
    }
    .buttonStyle(PressableStyle())
    .accessibilityLabel(subtitle.isEmpty ? title : "\(title). \(subtitle)")
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/// День недели — как Chip в RN-окне
private struct DayChip: View {
  let label: String
  let selected: Bool
  let palette: NewCoursePalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(label)
        .font(.system(size: 14, weight: .semibold))
        .lineLimit(1)
        .foregroundColor(Color(selected ? palette.primary : palette.textPrimary))
        .frame(maxWidth: .infinity, minHeight: Metrics.touch)
        .background(
          RoundedRectangle(cornerRadius: Metrics.radiusM)
            .fill(Color(selected ? palette.primary.withAlphaComponent(0.1) : palette.surfaceMuted))
        )
        .overlay(
          RoundedRectangle(cornerRadius: Metrics.radiusM)
            .strokeBorder(Color(selected ? palette.primary.withAlphaComponent(0.4) : palette.surfaceMuted), lineWidth: 1)
        )
    }
    .buttonStyle(PressableStyle())
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
