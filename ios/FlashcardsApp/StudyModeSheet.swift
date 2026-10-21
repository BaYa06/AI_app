//
//  StudyModeSheet.swift
//  Нативная шторка выбора режима (plan/new/liquid_glass.md, шаг Glass 0).
//
//  RN-шторка ехала рывками: её положение каждый кадр выставляет главный поток, а он в это время
//  создаёт содержимое. Здесь лист показывает UISheetPresentationController — движение анимирует
//  система, поэтому оно плавное. Содержимое на SwiftUI повторяет StudyModeSheet.tsx.
//  Фон листа непрозрачный (surface), без Liquid Glass.
//
//  JS → present(options) / dismiss(). Обратно — событие StudyModeSheetEvent:
//  { type: 'onlyHard' | 'showMnemonic', value: Bool }, { type: 'wordLimit', value: String },
//  { type: 'select', mode }, { type: 'dismiss' } (закрыли жестом).
//

import SwiftUI
import UIKit

@objc(StudyModeSheetModule)
class StudyModeSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "StudyModeSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?

  @objc static func requiresMainQueueSetup() -> Bool { false }

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

  private func presentSheet(_ options: NSDictionary) {
    guard presented == nil, let top = RCTPresentedViewController() else { return }

    let palette = StudyModePalette(options["colors"] as? NSDictionary ?? [:])
    let settings = options["settings"] as? NSDictionary ?? [:]
    let games = (options["games"] as? [NSDictionary] ?? []).map(StudyModeGame.init)
    let model = StudyModeSheetModel(
      subtitle: options["subtitle"] as? String ?? "",
      games: games,
      onlyHard: settings["onlyHard"] as? Bool ?? false,
      showMnemonic: settings["showMnemonic"] as? Bool ?? false,
      wordLimit: settings["wordLimit"] as? String ?? "all",
      palette: palette
    )

    let host = UIHostingController(rootView: StudyModeSheetView(model: model))
    host.view.backgroundColor = palette.surface
    host.overrideUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light

    model.onChange = { [weak self] type, value in self?.emit(["type": type, "value": value]) }
    model.onCancel = { [weak self, weak host] in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      host.dismiss(animated: true) { self.emit(["type": "dismiss"]) }
    }
    model.onSelect = { [weak self, weak host] mode in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      // Переход на тренировку — после закрытия листа, чтобы закрытие не дёргалось
      host.dismiss(animated: true) { self.emit(["type": "select", "mode": mode]) }
    }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      if #available(iOS 16.0, *) {
        // Высота по содержимому; если не помещается — весь экран, внутри прокрутка
        let width = top.view.bounds.width
        let measured = UIHostingController(rootView: StudyModeSheetContent(model: model))
          .sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
        let height = ceil(measured.height)
        sheet.detents = [.custom(identifier: .init("content")) { context in min(height, context.maximumDetentValue) }]
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
  let subtitle: String
  let games: [StudyModeGame]
  let palette: StudyModePalette
  @Published var onlyHard: Bool
  @Published var showMnemonic: Bool
  @Published var wordLimit: String

  var onChange: (String, Any) -> Void = { _, _ in }
  var onSelect: (String) -> Void = { _ in }
  var onCancel: () -> Void = {}

  init(subtitle: String, games: [StudyModeGame], onlyHard: Bool, showMnemonic: Bool, wordLimit: String, palette: StudyModePalette) {
    self.subtitle = subtitle
    self.games = games
    self.onlyHard = onlyHard
    self.showMnemonic = showMnemonic
    self.wordLimit = wordLimit
    self.palette = palette
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
      HStack(spacing: Metrics.s) {
        Text("Выбор режима")
          .font(.system(size: 20, weight: .semibold))
          .foregroundColor(Color(p.textPrimary))
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        Button("Отмена") { model.onCancel() }
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(p.textSecondary))
          .frame(minHeight: Metrics.touch)
      }
      .padding(.bottom, Metrics.xxs)

      Text(model.subtitle)
        .font(.system(size: 14))
        .foregroundColor(Color(p.textSecondary))
        .padding(.bottom, Metrics.m)

      VStack(alignment: .leading, spacing: Metrics.l) {
        RecommendedModeCard(palette: p) { model.onSelect("classic") }

        VStack(alignment: .leading, spacing: Metrics.s) {
          Overline(text: "Игры для закрепления", palette: p)
          ForEach(model.games) { game in
            GameRow(game: game, palette: p) { model.onSelect(game.mode) }
          }
        }

        VStack(alignment: .leading, spacing: Metrics.s) {
          Overline(text: "Настройки", palette: p)
          SettingToggle(title: "Только «Не запомнил»", palette: p, isOn: binding(\.onlyHard, event: "onlyHard"))
          SettingToggle(title: "Показывать мнемонику после ошибки", palette: p, isOn: binding(\.showMnemonic, event: "showMnemonic"))
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
        }
      }
    }
    .padding(.horizontal, Metrics.m)
    .padding(.top, Metrics.l)
    .padding(.bottom, Metrics.m)
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

private struct Overline: View {
  let text: String
  let palette: StudyModePalette

  var body: some View {
    Text(text.uppercased())
      .font(.system(size: 12, weight: .semibold))
      .kerning(0.8)
      .foregroundColor(Color(palette.textSecondary))
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

private struct RecommendedModeCard: View {
  let palette: StudyModePalette
  let action: () -> Void

  // Те же оценки и цвета, что в RecommendedModeCard.tsx
  private var rates: [Rate] {
    [
      Rate(label: "Не знаю", fill: palette.ratingAgain, text: palette.errorText),
      Rate(label: "Сомневаюсь", fill: palette.ratingHard, text: palette.warningText),
      Rate(label: "Почти", fill: palette.ratingEasy, text: palette.info),
      Rate(label: "Уверенно", fill: palette.ratingGood, text: palette.successText),
    ]
  }

  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: Metrics.s) {
        HStack(spacing: Metrics.s) {
          IconBox(symbol: "sparkles", tint: palette.primary, fill: palette.primary.withAlphaComponent(0.1))
          VStack(alignment: .leading, spacing: 0) {
            Text("Карточки")
              .font(.system(size: 16, weight: .bold))
              .foregroundColor(Color(palette.textPrimary))
            Text("Переворот 180° • Классический режим")
              .font(.system(size: 12))
              .foregroundColor(Color(palette.textSecondary))
          }
          Spacer(minLength: 0)
        }

        VStack(spacing: 0) {
          Text("scharf")
            .font(.system(size: 16, weight: .bold))
            .foregroundColor(Color(palette.textPrimary))
          Text("Нажми, чтобы перевернуть")
            .font(.system(size: 12))
            .foregroundColor(Color(palette.textSecondary))
        }
        .frame(maxWidth: .infinity)
        .padding(Metrics.m)
        .background(RoundedRectangle(cornerRadius: Metrics.radiusM).fill(Color(palette.surfaceMuted)))
        .overlay(RoundedRectangle(cornerRadius: Metrics.radiusM).stroke(Color(palette.border), lineWidth: 1))

        RatePills(rates: rates)
      }
      .padding(Metrics.m)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color(palette.surface))
      .overlay(alignment: .topTrailing) {
        Text("Рекомендуем")
          .font(.system(size: 12, weight: .bold))
          .foregroundColor(Color(palette.onPrimary))
          .padding(.horizontal, Metrics.s)
          .padding(.vertical, Metrics.xxs)
          .background(BottomLeftRounded(radius: Metrics.radiusM).fill(Color(palette.primaryFill)))
      }
      .clipShape(RoundedRectangle(cornerRadius: Metrics.radiusL))
      .overlay(RoundedRectangle(cornerRadius: Metrics.radiusL).strokeBorder(Color(palette.primary), lineWidth: 2))
      .contentShape(RoundedRectangle(cornerRadius: Metrics.radiusL))
    }
    .buttonStyle(PressableStyle())
    .accessibilityLabel("Карточки. Рекомендуем. Классический режим")
  }
}

/// Плашки оценок: в строку, а если не помещаются — переносом (iOS 16+) или 2 × 2 (iOS 15)
private struct Rate {
  let label: String
  let fill: UIColor
  let text: UIColor
}

private struct RatePills: View {
  let rates: [Rate]

  var body: some View {
    if #available(iOS 16.0, *) {
      FlowLayout(spacing: Metrics.xs) { pills }
    } else {
      VStack(alignment: .leading, spacing: Metrics.xs) {
        HStack(spacing: Metrics.xs) { ForEach(0..<2, id: \.self) { pill(rates[$0]) } }
        HStack(spacing: Metrics.xs) { ForEach(2..<rates.count, id: \.self) { pill(rates[$0]) } }
      }
    }
  }

  private var pills: some View {
    ForEach(rates, id: \.label) { pill($0) }
  }

  private func pill(_ rate: Rate) -> some View {
    Text(rate.label)
      .font(.system(size: 12, weight: .semibold))
      .foregroundColor(Color(rate.text))
      .padding(.horizontal, Metrics.s)
      .padding(.vertical, Metrics.xxs)
      .background(Capsule().fill(Color(rate.fill.withAlphaComponent(0.1))))
      .overlay(Capsule().stroke(Color(rate.fill.withAlphaComponent(0.2)), lineWidth: 1))
  }
}

@available(iOS 16.0, *)
private struct FlowLayout: Layout {
  let spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
    let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
    return CGSize(width: proposal.width ?? rows.reduce(0) { max($0, $1.width) }, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for row in arrange(width: bounds.width, subviews: subviews) {
      var x = bounds.minX
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private struct Row {
    var indices: [Int]
    var width: CGFloat
    var height: CGFloat
  }

  private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
    var rows: [Row] = []
    for (index, subview) in subviews.enumerated() {
      let size = subview.sizeThatFits(.unspecified)
      if let last = rows.last, last.width + spacing + size.width <= width {
        rows[rows.count - 1] = Row(indices: last.indices + [index], width: last.width + spacing + size.width, height: max(last.height, size.height))
      } else {
        rows.append(Row(indices: [index], width: size.width, height: size.height))
      }
    }
    return rows
  }
}

private struct BottomLeftRounded: Shape {
  let radius: CGFloat

  func path(in rect: CGRect) -> Path {
    Path(UIBezierPath(roundedRect: rect, byRoundingCorners: .bottomLeft, cornerRadii: CGSize(width: radius, height: radius)).cgPath)
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
