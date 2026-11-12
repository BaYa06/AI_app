//
//  ScheduleSheet.swift
//  Нативный лист «Расписание занятий» курса (plan/new/teacher_cabinet.md, Teacher 11).
//
//  Повторяет RN-окно src/components/push/CourseScheduleSheet.tsx: дни занятий, время начала
//  со стрелками ±15 минут, «Сохранить». Лист — UISheetPresentationController, как шторка режимов.
//  Расписание грузит и сохраняет JS; тексты и цвета тоже из JS.
//
//  JS → present(options), setLoaded(days, minutes), setBusy(Bool), setError(String?), finish(), dismiss().
//  Обратно — событие ScheduleSheetEvent: { type: 'save', days: [String], minutes: Int },
//  { type: 'finished' } — лист закрылся после finish(), { type: 'dismiss' }.
//

import SwiftUI
import UIKit

@objc(ScheduleSheetModule)
class ScheduleSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "ScheduleSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?
  private var model: ScheduleModel?
  private var relayout: () -> Void = {}

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

  /// Расписание загрузилось — подставить дни и время
  @objc(setLoaded:minutes:)
  func setLoaded(_ days: NSArray, minutes: NSNumber) {
    DispatchQueue.main.async {
      guard let model = self.model else { return }
      model.selected = Set(days as? [String] ?? [])
      model.minutes = minutes.intValue
      model.loading = false
      self.relayout()
    }
  }

  @objc(setBusy:)
  func setBusy(_ busy: Bool) {
    DispatchQueue.main.async {
      self.model?.saving = busy
      self.presented?.isModalInPresentation = busy
    }
  }

  @objc(setError:)
  func setError(_ error: NSString?) {
    DispatchQueue.main.async {
      self.model?.error = error as String?
      self.relayout()
    }
  }

  /// Сохранено — закрыть и сообщить, когда лист уже ушёл (JS покажет тост)
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
    let palette = SchedulePalette(options["colors"] as? NSDictionary ?? [:])
    let time = options["time"] as? NSDictionary ?? [:]
    let days = (options["days"] as? [NSDictionary] ?? []).map {
      ScheduleDay(key: $0["key"] as? String ?? "", label: $0["label"] as? String ?? "")
    }
    let model = ScheduleModel(
      texts: ScheduleTexts(options["texts"] as? NSDictionary ?? [:]),
      days: days,
      minutes: int(time["default"], 18 * 60),
      minMinutes: int(time["min"], 7 * 60),
      maxMinutes: int(time["max"], 22 * 60),
      step: int(time["step"], 15),
      palette: palette
    )

    let host = UIHostingController(rootView: ScheduleView(model: model))
    host.view.backgroundColor = palette.surface
    host.overrideUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light

    model.onSave = { [weak self, weak model] in
      guard let self, let model else { return }
      self.emit(["type": "save", "days": model.selectedDays, "minutes": model.minutes])
    }
    model.onCancel = { [weak self, weak host] in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      self.model = nil
      host.dismiss(animated: true) { self.emit(["type": "dismiss"]) }
    }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      if #available(iOS 16.0, *) {
        let width = top.view.bounds.width
        let measure: () -> CGFloat = { [weak model] in
          guard let model else { return 0 }
          let size = UIHostingController(rootView: ScheduleContent(model: model))
            .sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
          return ceil(size.height)
        }
        var contentHeight = measure()
        sheet.detents = [.custom(identifier: .init("content")) { context in min(contentHeight, context.maximumDetentValue) }]
        relayout = { [weak sheet] in
          contentHeight = measure()
          sheet?.animateChanges { sheet?.invalidateDetents() }
        }
      } else {
        sheet.detents = [.medium(), .large()]
        relayout = {}
      }
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

struct ScheduleDay: Identifiable {
  let key: String
  let label: String
  var id: String { key }
}

/// Тексты листа — из JS; здесь только запасные
struct ScheduleTexts {
  let title, close, description, daysLabel, timeLabel, timeHint: String
  let earlier, later, startsAt, save, saving: String

  init(_ dict: NSDictionary) {
    func text(_ key: String, _ fallback: String) -> String { dict[key] as? String ?? fallback }
    title = text("title", "Расписание занятий")
    close = text("close", "Закрыть")
    description = text("description", "")
    daysLabel = text("daysLabel", "Дни занятий")
    timeLabel = text("timeLabel", "Начало занятия")
    timeHint = text("timeHint", "")
    earlier = text("earlier", "Раньше на 15 минут")
    later = text("later", "Позже на 15 минут")
    startsAt = text("startsAt", "Начало в")
    save = text("save", "Сохранить")
    saving = text("saving", "Сохранение…")
  }
}

/// Токены темы из JS (useThemeColors, переданы через processColor)
struct SchedulePalette {
  let surface: UIColor
  let surfaceMuted: UIColor
  let border: UIColor
  let textPrimary: UIColor
  let textSecondary: UIColor
  let primary: UIColor
  let primaryFill: UIColor
  let onPrimary: UIColor
  let errorText: UIColor

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
    primary = color("primary", .systemIndigo)
    primaryFill = color("primaryFill", .systemIndigo)
    onPrimary = color("onPrimary", .white)
    errorText = color("errorText", .systemRed)
  }
}

final class ScheduleModel: ObservableObject {
  let texts: ScheduleTexts
  let days: [ScheduleDay]
  let minMinutes: Int
  let maxMinutes: Int
  let step: Int
  let palette: SchedulePalette

  @Published var selected: Set<String> = []
  @Published var minutes: Int
  @Published var loading = true
  @Published var saving = false
  @Published var error: String?

  var onSave: () -> Void = {}
  var onCancel: () -> Void = {}

  init(
    texts: ScheduleTexts,
    days: [ScheduleDay],
    minutes: Int,
    minMinutes: Int,
    maxMinutes: Int,
    step: Int,
    palette: SchedulePalette
  ) {
    self.texts = texts
    self.days = days
    self.minutes = minutes
    self.minMinutes = minMinutes
    self.maxMinutes = maxMinutes
    self.step = step
    self.palette = palette
  }

  var selectedDays: [String] { days.map(\.key).filter { selected.contains($0) } }
  var timeText: String { String(format: "%02d:%02d", minutes / 60, minutes % 60) }

  func toggle(_ day: String) {
    UISelectionFeedbackGenerator().selectionChanged()
    if selected.contains(day) { selected.remove(day) } else { selected.insert(day) }
  }

  func shift(_ delta: Int) {
    minutes = min(maxMinutes, max(minMinutes, minutes + delta))
  }
}

// MARK: - Вид

struct ScheduleView: View {
  @ObservedObject var model: ScheduleModel

  var body: some View {
    ScrollView(showsIndicators: false) {
      ScheduleContent(model: model)
    }
    .background(Color(model.palette.surface).ignoresSafeArea())
  }
}

struct ScheduleContent: View {
  @ObservedObject var model: ScheduleModel
  private var p: SchedulePalette { model.palette }
  private var t: ScheduleTexts { model.texts }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(spacing: 8) {
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
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(SchedulePressable())
        .accessibilityLabel(t.close)
      }

      if model.loading {
        ProgressView()
          .tint(Color(p.primary))
          .frame(maxWidth: .infinity)
          .padding(.vertical, 24)
      } else {
        if !t.description.isEmpty {
          Text(t.description)
            .font(.system(size: 16))
            .foregroundColor(Color(p.textSecondary))
            .fixedSize(horizontal: false, vertical: true)
        }
        label(t.daysLabel)
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 7), spacing: 8) {
          ForEach(model.days) { day in
            let on = model.selected.contains(day.key)
            Button { model.toggle(day.key) } label: {
              Text(day.label)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
                .foregroundColor(Color(on ? p.primary : p.textPrimary))
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(
                  RoundedRectangle(cornerRadius: 12)
                    .fill(Color(on ? p.primary.withAlphaComponent(0.1) : p.surfaceMuted))
                )
                .overlay(
                  RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color(on ? p.primary.withAlphaComponent(0.4) : p.surfaceMuted), lineWidth: 1)
                )
            }
            .buttonStyle(SchedulePressable())
            .accessibilityAddTraits(on ? .isSelected : [])
          }
        }
        label(t.timeLabel)
        HStack(spacing: 16) {
          stepButton("chevron.down", label: t.earlier) { model.shift(-model.step) }
          Text(model.timeText)
            .font(.system(size: 24, weight: .bold).monospacedDigit())
            .foregroundColor(Color(p.textPrimary))
            .accessibilityLabel("\(t.startsAt) \(model.timeText)")
          stepButton("chevron.up", label: t.later) { model.shift(model.step) }
        }
        .frame(maxWidth: .infinity)
        if !t.timeHint.isEmpty {
          Text(t.timeHint)
            .font(.system(size: 12))
            .foregroundColor(Color(p.textSecondary))
        }
        if let error = model.error {
          Text(error)
            .font(.system(size: 14))
            .foregroundColor(Color(p.errorText))
        }
        Button { model.onSave() } label: {
          ZStack {
            if model.saving {
              ProgressView().tint(Color(p.onPrimary))
            } else {
              Text(t.save)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(p.onPrimary))
            }
          }
          .frame(maxWidth: .infinity, minHeight: 52)
          .background(RoundedRectangle(cornerRadius: 12).fill(Color(p.primaryFill)))
        }
        .buttonStyle(SchedulePressable())
        .disabled(model.saving)
        .accessibilityLabel(model.saving ? t.saving : t.save)
      }
    }
    .padding(.horizontal, 16)
    .padding(.top, 24)
    .padding(.bottom, 24)
    .disabled(model.saving)
  }

  private func label(_ text: String) -> some View {
    Text(text)
      .font(.system(size: 14, weight: .semibold))
      .foregroundColor(Color(p.textSecondary))
  }

  private func stepButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 18, weight: .semibold))
        .foregroundColor(Color(p.textSecondary))
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(SchedulePressable())
    .accessibilityLabel(label)
  }
}

/// Нажатие — прозрачность 0.85, как у Pressable в RN
private struct SchedulePressable: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
  }
}
