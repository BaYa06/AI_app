//
//  StudyModeSheet.swift
//  Нативная шторка выбора режима (plan/new/liquid_glass.md, шаг Glass 0).
//
//  RN-шторка ехала рывками: её положение каждый кадр выставляет главный поток, а он в это время
//  создаёт содержимое. Здесь лист показывает UISheetPresentationController — движение анимирует
//  система, поэтому оно плавное. Содержимое на SwiftUI повторяет StudyModeSheet.tsx.
//  Фон листа непрозрачный (surface), без Liquid Glass.
//
//  Шторка набора (plan/new/study_session.md, Session 12): одна яркая кнопка сессии «Изучить»,
//  тихая «Свободная практика» со всеми режимами, настройки практики под шестерёнкой. На главной
//  (home) — только свободная практика. Тексты кнопки сессии считает JS (sessionSheetText.ts).
//
//  JS → present(options) / dismiss(). Обратно — событие StudyModeSheetEvent:
//  { type: 'onlyHard', value: Bool }, { type: 'wordLimit', value: String },
//  { type: 'select', mode }, { type: 'start' }, { type: 'addWords' }, { type: 'dismiss' }.
//

import SwiftUI
import UIKit

@objc(StudyModeSheetModule)
class StudyModeSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "StudyModeSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?

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

  @objc func dismiss() {
    DispatchQueue.main.async {
      guard let sheet = self.presented, sheet.presentingViewController != nil, !sheet.isBeingDismissed else { return }
      self.presented = nil
      sheet.dismiss(animated: true)
    }
  }

  /// Закрыть лист и сообщить JS — после закрытия, чтобы переход на тренировку не дёргал анимацию
  private func close(_ host: UIViewController?, emitting body: [String: Any]) {
    guard let host, presented === host else { return }
    presented = nil
    host.dismiss(animated: true) { self.emit(body) }
  }

  private func presentSheet(_ options: NSDictionary) {
    guard presented == nil, let top = RCTPresentedViewController() else { return }

    let palette = StudyModePalette(options["colors"] as? NSDictionary ?? [:])
    let settings = options["settings"] as? NSDictionary ?? [:]
    let games = (options["games"] as? [NSDictionary] ?? []).map(StudyModeGame.init)
    let model = StudyModeSheetModel(
      title: options["title"] as? String ?? "Свободная практика",
      subtitle: options["subtitle"] as? String ?? "",
      home: options["home"] as? Bool ?? true,
      noWords: options["noWords"] as? Bool ?? false,
      session: StudySessionButton(options["session"] as? NSDictionary),
      games: games,
      onlyHard: settings["onlyHard"] as? Bool ?? false,
      wordLimit: settings["wordLimit"] as? String ?? "all",
      palette: palette
    )

    let host = UIHostingController(rootView: StudyModeSheetView(model: model))
    host.view.backgroundColor = palette.surface
    host.overrideUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light

    model.onChange = { [weak self] type, value in self?.emit(["type": type, "value": value]) }
    model.onCancel = { [weak self, weak host] in self?.close(host, emitting: ["type": "dismiss"]) }
    model.onSelect = { [weak self, weak host] mode in self?.close(host, emitting: ["type": "select", "mode": mode]) }
    model.onStart = { [weak self, weak host] in self?.close(host, emitting: ["type": "start"]) }
    model.onAddWords = { [weak self, weak host] in self?.close(host, emitting: ["type": "addWords"]) }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      if #available(iOS 16.0, *) {
        // Высота по содержимому; если не помещается — весь экран, внутри прокрутка.
        // Раскрыли «Свободную практику» или настройки — высота пересчитывается.
        let width = top.view.bounds.width
        let measure: () -> CGFloat = { [weak model] in
          guard let model else { return 0 }
          let size = UIHostingController(rootView: StudyModeSheetContent(model: model))
            .sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
          return ceil(size.height)
        }
        var contentHeight = measure()
        sheet.detents = [.custom(identifier: .init("content")) { context in min(contentHeight, context.maximumDetentValue) }]
        model.onLayoutChange = { [weak sheet] in
          DispatchQueue.main.async {
            contentHeight = measure()
            sheet?.animateChanges { sheet?.invalidateDetents() }
          }
        }
      } else {
        sheet.detents = [.large()]
      }
      sheet.prefersGrabberVisible = true
      sheet.preferredCornerRadius = 24
      sheet.delegate = self
    }

    presented = host
    top.present(host, animated: true)
  }

  // Закрыли жестом (свайп вниз, нажатие на затемнение)
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    guard presentationController.presentedViewController === presented else { return }
    presented = nil
    emit(["type": "dismiss"])
  }
}

// MARK: - Данные

struct StudyModeGame: Identifiable {
  let mode: String
  let title: String
  let tag: String
  let description: String
  var id: String { mode }

  init(_ dict: NSDictionary) {
    mode = dict["mode"] as? String ?? ""
    title = dict["title"] as? String ?? ""
    tag = dict["tag"] as? String ?? ""
    description = dict["description"] as? String ?? ""
  }

  /// SF Symbol вместо иконки lucide из StudyModeSheet.tsx
  var symbol: String {
    switch mode {
    case "classic": return "rectangle.on.rectangle"
    case "match": return "puzzlepiece"
    case "multipleChoice":
      if #available(iOS 16.0, *) { return "list.bullet.clipboard" }
      return "list.bullet.rectangle"
    case "wordBuilder": return "textformat"
    case "audio": return "headphones"
    case "contextFill": return "text.book.closed"
    default: return "square.grid.2x2"
    }
  }
}

/// Кнопка сессии набора — тексты из JS (sessionSheetText.ts). kind: "button" или "empty"
/// (пустой набор / меньше 4 слов: подсказка и «Добавить слова»)
struct StudySessionButton {
  let kind: String
  let title: String
  let caption: String
  let route: String
  let stageCount: Int
  let text: String

  init?(_ dict: NSDictionary?) {
    guard let dict else { return nil }
    kind = dict["kind"] as? String ?? "button"
    title = dict["title"] as? String ?? ""
    caption = dict["caption"] as? String ?? ""
    route = dict["route"] as? String ?? ""
    stageCount = (dict["stageCount"] as? NSNumber)?.intValue ?? 0
    text = dict["text"] as? String ?? ""
  }
}

/// Токены темы из JS (useThemeColors, переданы через processColor)
struct StudyModePalette {
  let surface: UIColor
  let surfaceMuted: UIColor
  let border: UIColor
  let textPrimary: UIColor
  let textSecondary: UIColor
  let textTertiary: UIColor
  let primary: UIColor
  let primaryFill: UIColor
  let onPrimary: UIColor
  let ratingAgain: UIColor
  let ratingHard: UIColor
  let ratingEasy: UIColor
  let ratingGood: UIColor
  let errorText: UIColor
  let warningText: UIColor
  let info: UIColor
  let successText: UIColor

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
    ratingAgain = color("ratingAgain", .systemRed)
    ratingHard = color("ratingHard", .systemOrange)
    ratingEasy = color("ratingEasy", .systemBlue)
    ratingGood = color("ratingGood", .systemGreen)
    errorText = color("errorText", .systemRed)
    warningText = color("warningText", .systemOrange)
    info = color("info", .systemBlue)
    successText = color("successText", .systemGreen)
  }
}

final class StudyModeSheetModel: ObservableObject {
  let title: String
  let subtitle: String
  /// Шторка на главной: только свободная практика, без кнопки сессии
  let home: Bool
  /// В наборе нет слов — свободная практика недоступна, шестерёнки нет
  let noWords: Bool
  let session: StudySessionButton?
  let games: [StudyModeGame]
  let palette: StudyModePalette
  @Published var onlyHard: Bool
  @Published var wordLimit: String
  @Published var freeOpen: Bool
  @Published var showSettings = false

  var onChange: (String, Any) -> Void = { _, _ in }
  var onSelect: (String) -> Void = { _ in }
  var onStart: () -> Void = {}
  var onAddWords: () -> Void = {}
  var onCancel: () -> Void = {}
  /// Содержимое сменило высоту — лист подстраивается
  var onLayoutChange: () -> Void = {}

  init(
    title: String,
    subtitle: String,
    home: Bool,
    noWords: Bool,
    session: StudySessionButton?,
    games: [StudyModeGame],
    onlyHard: Bool,
    wordLimit: String,
    palette: StudyModePalette
  ) {
    self.title = title
    self.subtitle = subtitle
    self.home = home
    self.noWords = noWords
    self.session = session
    self.games = games
    self.onlyHard = onlyHard
    self.wordLimit = wordLimit
    self.palette = palette
    freeOpen = home
  }

  func toggleFree() {
    freeOpen.toggle()
    onLayoutChange()
  }

  func setSettings(_ on: Bool) {
    showSettings = on
    onLayoutChange()
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
  static let radiusXL: CGFloat = 24
  static let touch: CGFloat = 44
  static let button: CGFloat = 52
}

struct StudyModeSheetView: View {
  @ObservedObject var model: StudyModeSheetModel

  var body: some View {
    ScrollView(showsIndicators: false) {
      StudyModeSheetContent(model: model)
    }
    .background(Color(model.palette.surface).ignoresSafeArea())
  }
}

struct StudyModeSheetContent: View {
  @ObservedObject var model: StudyModeSheetModel
  private var p: StudyModePalette { model.palette }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      header
      if model.showSettings {
        settings
      } else {
        main
      }
    }
    .padding(.horizontal, Metrics.m)
    .padding(.top, Metrics.l)
    .padding(.bottom, Metrics.m)
  }

  private var header: some View {
    HStack(spacing: Metrics.xs) {
      Text(model.showSettings ? "Настройки практики" : model.title)
        .font(.system(size: 20, weight: .semibold))
        .foregroundColor(Color(p.textPrimary))
        .lineLimit(1)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      if model.showSettings {
        Button("Готово") { model.setSettings(false) }
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(p.primary))
          .frame(minHeight: Metrics.touch)
      } else {
        if !model.noWords {
          IconButton(symbol: "gearshape", label: "Настройки практики", palette: p) { model.setSettings(true) }
        }
        IconButton(symbol: "xmark", label: "Закрыть", palette: p) { model.onCancel() }
      }
    }
    .padding(.bottom, Metrics.xxs)
  }

  private var main: some View {
    VStack(alignment: .leading, spacing: Metrics.m) {
      Text(model.subtitle)
        .font(.system(size: 14))
        .foregroundColor(Color(p.textSecondary))

      if let session = model.session {
        if session.kind == "empty" {
          EmptySessionBlock(session: session, palette: p) { model.onAddWords() }
        } else {
          SessionButtonView(session: session, palette: p) { model.onStart() }
        }
      }

      if !model.home {
        freeToggle
      }

      if model.freeOpen && !model.noWords {
        VStack(spacing: Metrics.s) {
          ForEach(model.games) { game in
            GameRow(game: game, palette: p) { model.onSelect(game.mode) }
          }
        }
      }
    }
  }

  private var freeToggle: some View {
    VStack(spacing: 0) {
      Rectangle()
        .fill(Color(p.border))
        .frame(height: 1)
      Button { model.toggleFree() } label: {
        HStack(spacing: Metrics.s) {
          VStack(alignment: .leading, spacing: 2) {
            Text("Свободная практика")
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(Color(p.textPrimary))
            Text(model.noWords ? "Появится, когда добавите слова" : "Любой режим отдельно")
              .font(.system(size: 12))
              .foregroundColor(Color(p.textSecondary))
          }
          Spacer(minLength: 0)
          HStack(spacing: -6) {
            ForEach(Array(model.games.prefix(5))) { game in
              Image(systemName: game.symbol)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(p.textSecondary))
                .frame(width: 26, height: 26)
                .background(Circle().fill(Color(p.surfaceMuted)))
                .overlay(Circle().strokeBorder(Color(p.surface), lineWidth: 2))
            }
          }
          .accessibilityHidden(true)
          Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color(p.textTertiary))
            .rotationEffect(.degrees(model.freeOpen ? 90 : 0))
        }
        .frame(minHeight: Metrics.touch)
        .padding(.top, Metrics.xs)
        .contentShape(Rectangle())
      }
      .buttonStyle(PressableStyle())
      .disabled(model.noWords)
      .opacity(model.noWords ? 0.6 : 1)
      .accessibilityLabel("Свободная практика")
      .accessibilityValue(model.freeOpen ? "Раскрыто" : "Свёрнуто")
    }
  }

  private var settings: some View {
    VStack(alignment: .leading, spacing: Metrics.s) {
      SettingToggle(title: "Только «Не запомнил»", palette: p, isOn: binding(\.onlyHard, event: "onlyHard"))
      HStack(spacing: Metrics.s) {
        Text("Количество слов")
          .font(.system(size: 16))
          .foregroundColor(Color(p.textPrimary))
        Spacer(minLength: 0)
        HStack(spacing: Metrics.xs) {
          ForEach(["10", "20", "30", "all"], id: \.self) { value in
            Chip(label: value == "all" ? "Все" : value, selected: model.wordLimit == value, palette: p) {
              guard model.wordLimit != value else { return }
              model.wordLimit = value
              model.onChange("wordLimit", value)
            }
          }
        }
      }
      .frame(minHeight: Metrics.touch)
      Text("Действуют только на свободную практику. Сколько слов взять в сессию, приложение решает само.")
        .font(.system(size: 12))
        .foregroundColor(Color(p.textSecondary))
    }
    .padding(.top, Metrics.s)
  }

  private func binding(_ keyPath: ReferenceWritableKeyPath<StudyModeSheetModel, Bool>, event: String) -> Binding<Bool> {
    Binding(
      get: { model[keyPath: keyPath] },
      set: { value in
        UISelectionFeedbackGenerator().selectionChanged()
        model[keyPath: keyPath] = value
        model.onChange(event, value)
      }
    )
  }
}

/// Нажатие — прозрачность 0.85, как у Pressable в RN
private struct PressableStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
  }
}

private struct IconBox: View {
  let symbol: String
  let tint: UIColor
  let fill: UIColor

  var body: some View {
    Image(systemName: symbol)
      .font(.system(size: 18, weight: .medium))
      .foregroundColor(Color(tint))
      .frame(width: 40, height: 40)
      .background(RoundedRectangle(cornerRadius: Metrics.radiusM).fill(Color(fill)))
  }
}

/// Главная кнопка шторки набора — единственный яркий элемент
private struct SessionButtonView: View {
  let session: StudySessionButton
  let palette: StudyModePalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: Metrics.s) {
        HStack(alignment: .top, spacing: Metrics.s) {
          Image(systemName: "play.fill")
            .font(.system(size: 18))
            .foregroundColor(Color(palette.primaryFill))
            .frame(width: Metrics.touch, height: Metrics.touch)
            .background(Circle().fill(Color(palette.onPrimary)))
          VStack(alignment: .leading, spacing: 2) {
            Text(session.title)
              .font(.system(size: 20, weight: .bold))
              .foregroundColor(Color(palette.onPrimary))
            Text(session.caption)
              .font(.system(size: 14))
              .foregroundColor(Color(palette.onPrimary).opacity(0.85))
              .fixedSize(horizontal: false, vertical: true)
          }
          Spacer(minLength: 0)
          Text("Рекомендуем")
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(Color(palette.onPrimary))
            .padding(.horizontal, Metrics.xs)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color(palette.onPrimary).opacity(0.2)))
        }
        HStack(spacing: Metrics.s) {
          HStack(spacing: 3) {
            ForEach(0..<session.stageCount, id: \.self) { index in
              Capsule()
                .fill(Color(palette.onPrimary).opacity(index == 0 ? 1 : 0.4))
                .frame(width: 14, height: 4)
            }
          }
          Text(session.route)
            .font(.system(size: 12))
            .foregroundColor(Color(palette.onPrimary).opacity(0.85))
            .lineLimit(1)
        }
      }
      .padding(Metrics.m)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(RoundedRectangle(cornerRadius: Metrics.radiusXL).fill(Color(palette.primaryFill)))
      .contentShape(RoundedRectangle(cornerRadius: Metrics.radiusXL))
    }
    .buttonStyle(PressableStyle())
    .accessibilityLabel("\(session.title). \(session.caption). Рекомендуем")
  }
}

/// Пустой набор или меньше 4 слов: подсказка и «Добавить слова»
private struct EmptySessionBlock: View {
  let session: StudySessionButton
  let palette: StudyModePalette
  let action: () -> Void

  var body: some View {
    VStack(spacing: Metrics.xs) {
      Text(session.title)
        .font(.system(size: 20, weight: .semibold))
        .foregroundColor(Color(palette.textPrimary))
        .multilineTextAlignment(.center)
      Text(session.text)
        .font(.system(size: 14))
        .foregroundColor(Color(palette.textSecondary))
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
      Button(action: action) {
        Text("Добавить слова")
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(palette.onPrimary))
          .frame(maxWidth: .infinity, minHeight: Metrics.button)
          .background(RoundedRectangle(cornerRadius: Metrics.radiusM).fill(Color(palette.primaryFill)))
      }
      .buttonStyle(PressableStyle())
      .padding(.top, Metrics.s)
    }
    .padding(Metrics.l)
    .frame(maxWidth: .infinity)
    .overlay(
      RoundedRectangle(cornerRadius: Metrics.radiusXL)
        .strokeBorder(Color(palette.border), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
    )
  }
}

/// Круглая кнопка-иконка в шапке (шестерёнка, закрыть)
private struct IconButton: View {
  let symbol: String
  let label: String
  let palette: StudyModePalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 16, weight: .semibold))
        .foregroundColor(Color(palette.textSecondary))
        .frame(width: 36, height: 36)
        .background(Circle().fill(Color(palette.surfaceMuted)))
        .frame(width: Metrics.touch, height: Metrics.touch)
        .contentShape(Rectangle())
    }
    .buttonStyle(PressableStyle())
    .accessibilityLabel(label)
  }
}

private struct GameRow: View {
  let game: StudyModeGame
  let palette: StudyModePalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: Metrics.s) {
        IconBox(symbol: game.symbol, tint: palette.textPrimary, fill: palette.surfaceMuted)
        VStack(alignment: .leading, spacing: Metrics.xxs) {
          HStack(spacing: Metrics.s) {
            Text(game.title)
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(Color(palette.textPrimary))
            Text(game.tag)
              .font(.system(size: 12, weight: .semibold))
              .foregroundColor(Color(palette.textSecondary))
              .lineLimit(1)
              .padding(.horizontal, Metrics.xs)
              .padding(.vertical, 2)
              .background(RoundedRectangle(cornerRadius: 8).fill(Color(palette.surfaceMuted)))
          }
          Text(game.description)
            .font(.system(size: 12))
            .foregroundColor(Color(palette.textSecondary))
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(.system(size: 14, weight: .semibold))
          .foregroundColor(Color(palette.textTertiary))
      }
      .padding(Metrics.m)
      .background(RoundedRectangle(cornerRadius: Metrics.radiusL).fill(Color(palette.surface)))
      .overlay(RoundedRectangle(cornerRadius: Metrics.radiusL).strokeBorder(Color(palette.border), lineWidth: 1))
      .contentShape(RoundedRectangle(cornerRadius: Metrics.radiusL))
    }
    .buttonStyle(PressableStyle())
    .accessibilityLabel("\(game.title). \(game.description)")
  }
}

private struct SettingToggle: View {
  let title: String
  let palette: StudyModePalette
  @Binding var isOn: Bool

  var body: some View {
    Toggle(isOn: $isOn) {
      Text(title)
        .font(.system(size: 16))
        .foregroundColor(Color(palette.textPrimary))
    }
    .tint(Color(palette.primary))
    .frame(minHeight: Metrics.touch)
  }
}

private struct Chip: View {
  let label: String
  let selected: Bool
  let palette: StudyModePalette
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(label)
        .font(.system(size: 14, weight: .semibold))
        .lineLimit(1)
        .foregroundColor(Color(selected ? palette.primary : palette.textPrimary))
        .padding(.horizontal, Metrics.s)
        .frame(minHeight: 36)
        .background(Capsule().fill(Color(selected ? palette.primary.withAlphaComponent(0.1) : palette.surfaceMuted)))
        .overlay(Capsule().strokeBorder(Color(selected ? palette.primary.withAlphaComponent(0.4) : palette.surfaceMuted), lineWidth: 1))
    }
    .buttonStyle(PressableStyle())
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
