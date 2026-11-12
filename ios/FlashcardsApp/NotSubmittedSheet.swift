//
//  NotSubmittedSheet.swift
//  Нативный лист «Кто не сдал» (plan/new/teacher_cabinet.md, Teacher 23; макет 12а).
//
//  Повторяет RN-окно src/screens/teacherHomework/NotSubmittedSheet.tsx. Лист показывает
//  UISheetPresentationController, как шторку режимов (StudyModeSheet.swift). Состояние (фильтр,
//  галочки, подписи) живёт в JS (nativeNotSubmittedSheet.ts) и приходит через update(); Swift только
//  рисует и присылает нажатия — как JoinCodeSheet.swift. Тексты и цвета — из JS.
//
//  JS → present(options), update(state), dismiss().
//  Обратно — NotSubmittedSheetEvent: { type: 'tab', key } | { type: 'toggle', id } | { type: 'toggleAll' }
//  | { type: 'send' } | { type: 'open', id } | { type: 'retry' } | { type: 'dismiss' }.
//

import SwiftUI
import UIKit

@objc(NotSubmittedSheetModule)
class NotSubmittedSheetModule: RCTEventEmitter, UISheetPresentationControllerDelegate {
  static let eventName = "NotSubmittedSheetEvent"

  private var hasListeners = false
  private weak var presented: UIViewController?
  private var model: NsModel?

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

  @objc(update:)
  func update(_ state: NSDictionary) {
    DispatchQueue.main.async { self.model?.apply(state) }
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

    let palette = NsPalette(options["colors"] as? NSDictionary ?? [:])
    let model = NsModel(close: options["close"] as? String ?? "", palette: palette)
    model.apply(options["state"] as? NSDictionary ?? [:])
    model.emit = { [weak self] body in self?.emit(body) }

    let host = UIHostingController(rootView: NsView(model: model))
    host.view.backgroundColor = palette.surface
    host.overrideUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light

    model.onClose = { [weak self, weak host] in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      self.model = nil
      host.dismiss(animated: true) { self.emit(["type": "dismiss"]) }
    }
    // Открыть ученика: сначала закрыть лист, потом JS перейдёт на экран
    model.onOpen = { [weak self, weak host] id in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      self.model = nil
      host.dismiss(animated: true) { self.emit(["type": "open", "id": id]) }
    }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      sheet.detents = [.medium(), .large()]
      sheet.selectedDetentIdentifier = .large
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

struct NsPalette {
  let surface, surfaceMuted, border, borderLight: UIColor
  let textPrimary, textSecondary, textTertiary: UIColor
  let primary, primaryFill, onPrimary: UIColor
  let warning, warningText, homeworkText, errorText, successFill: UIColor

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
    warning = color("warning", .systemOrange)
    warningText = color("warningText", .systemOrange)
    homeworkText = color("homeworkText", .systemOrange)
    errorText = color("errorText", .systemRed)
    successFill = color("gameGreen", .systemGreen)
  }
}

struct NsTab: Identifiable {
  let id: String
  let label: String
  let selected: Bool
}

struct NsRow: Identifiable {
  let id: String
  let name: String
  let initials: String
  let status: String
  let progress: Bool
  let seen: String
  let seenAlert: Bool
  let reminded: Bool
  let on: Bool
  let toggleLabel: String
}

final class NsModel: ObservableObject {
  let close: String
  let palette: NsPalette

  @Published var title = ""
  @Published var subtitle = ""
  @Published var due = ""
  @Published var loading = true
  @Published var failed = false
  @Published var retry = ""
  @Published var empty = ""
  @Published var tabs: [NsTab] = []
  @Published var toggleAll = ""
  @Published var rows: [NsRow] = []
  @Published var button = ""
  @Published var buttonEnabled = false
  @Published var sent = false
  @Published var busy = false
  @Published var hint = ""

  var emit: ([String: Any]) -> Void = { _ in }
  var onClose: () -> Void = {}
  var onOpen: (String) -> Void = { _ in }

  init(close: String, palette: NsPalette) {
    self.close = close
    self.palette = palette
  }

  func apply(_ s: NSDictionary) {
    func str(_ key: String) -> String { s[key] as? String ?? "" }
    func flag(_ key: String) -> Bool { s[key] as? Bool ?? false }
    title = str("title")
    subtitle = str("subtitle")
    due = str("due")
    loading = flag("loading")
    failed = flag("failed")
    retry = str("retry")
    empty = str("empty")
    toggleAll = str("toggleAll")
    button = str("button")
    buttonEnabled = flag("buttonEnabled")
    sent = flag("sent")
    busy = flag("busy")
    hint = str("hint")
    tabs = (s["tabs"] as? [NSDictionary] ?? []).map {
      NsTab(id: $0["key"] as? String ?? "", label: $0["label"] as? String ?? "", selected: $0["selected"] as? Bool ?? false)
    }
    rows = (s["rows"] as? [NSDictionary] ?? []).map {
      NsRow(
        id: $0["id"] as? String ?? "",
        name: $0["name"] as? String ?? "",
        initials: $0["initials"] as? String ?? "",
        status: $0["status"] as? String ?? "",
        progress: $0["progress"] as? Bool ?? false,
        seen: $0["seen"] as? String ?? "",
        seenAlert: $0["seenAlert"] as? Bool ?? false,
        reminded: $0["reminded"] as? Bool ?? false,
        on: $0["on"] as? Bool ?? false,
        toggleLabel: $0["toggleLabel"] as? String ?? ""
      )
    }
  }

  func tap(_ body: [String: Any]) {
    UISelectionFeedbackGenerator().selectionChanged()
    emit(body)
  }
}

// MARK: - Вид

private enum Ns {
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

private struct NsPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
  }
}

struct NsView: View {
  @ObservedObject var model: NsModel
  private var p: NsPalette { model.palette }

  var body: some View {
    VStack(spacing: 0) {
      header
      if model.loading || model.failed {
        Spacer()
        if model.failed {
          Button { model.tap(["type": "retry"]) } label: {
            Text(model.retry)
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(Color(p.primary))
              .frame(minHeight: Ns.touch)
          }
        } else {
          ProgressView().tint(Color(p.primary))
        }
        Spacer()
      } else {
        ScrollView(showsIndicators: false) {
          VStack(alignment: .leading, spacing: Ns.s) {
            if model.rows.isEmpty && model.tabs.isEmpty {
              Text(model.empty).foregroundColor(Color(p.textSecondary))
            } else {
              segment
              if !model.toggleAll.isEmpty {
                HStack {
                  Spacer()
                  Button { model.tap(["type": "toggleAll"]) } label: {
                    Text(model.toggleAll)
                      .font(.system(size: 14, weight: .semibold))
                      .foregroundColor(Color(p.primary))
                      .frame(minHeight: 32)
                  }
                  .buttonStyle(NsPress())
                }
              }
              list
            }
          }
          .padding(.horizontal, Ns.m)
          .padding(.bottom, Ns.l)
        }
        if !model.button.isEmpty { footer }
      }
    }
    .background(Color(p.surface).ignoresSafeArea())
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: Ns.xxs) {
      HStack(spacing: Ns.xs) {
        Text(model.title)
          .font(.system(size: 20, weight: .semibold))
          .foregroundColor(Color(p.textPrimary))
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        Button { model.onClose() } label: {
          Image(systemName: "xmark")
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(Color(p.textSecondary))
            .frame(width: 36, height: 36)
            .background(Circle().fill(Color(p.surfaceMuted)))
            .frame(width: Ns.touch, height: Ns.touch)
        }
        .buttonStyle(NsPress())
        .accessibilityLabel(model.close)
      }
      if !model.subtitle.isEmpty {
        Text(model.subtitle)
          .font(.system(size: 14))
          .foregroundColor(Color(p.textSecondary))
      }
      if !model.due.isEmpty {
        Label(model.due, systemImage: "clock")
          .font(.system(size: 14, weight: .semibold))
          .foregroundColor(Color(p.homeworkText))
      }
    }
    .padding(.horizontal, Ns.m)
    .padding(.top, Ns.l)
    .padding(.bottom, Ns.s)
  }

  private var segment: some View {
    HStack(spacing: 2) {
      ForEach(model.tabs) { tab in
        Button { model.tap(["type": "tab", "key": tab.id]) } label: {
          Text(tab.label)
            .font(.system(size: 13, weight: .semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundColor(Color(p.textPrimary))
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(
              RoundedRectangle(cornerRadius: Ns.radiusS)
                .fill(Color(tab.selected ? p.surface : p.surfaceMuted))
                .shadow(color: .black.opacity(tab.selected ? 0.12 : 0), radius: 2, y: 1)
            )
        }
        .buttonStyle(NsPress())
        .accessibilityAddTraits(tab.selected ? .isSelected : [])
      }
    }
    .padding(2)
    .background(RoundedRectangle(cornerRadius: Ns.radiusM).fill(Color(p.surfaceMuted)))
  }

  private var list: some View {
    VStack(spacing: 0) {
      ForEach(Array(model.rows.enumerated()), id: \.element.id) { index, row in
        HStack(spacing: 0) {
          Button { model.tap(["type": "toggle", "id": row.id]) } label: {
            ZStack {
              RoundedRectangle(cornerRadius: Ns.radiusS)
                .fill(Color(row.on ? p.primaryFill : p.surface))
              RoundedRectangle(cornerRadius: Ns.radiusS)
                .strokeBorder(Color(row.on ? p.primaryFill : p.border), lineWidth: 2)
              if row.on {
                Image(systemName: "checkmark")
                  .font(.system(size: 12, weight: .heavy))
                  .foregroundColor(Color(p.onPrimary))
              }
            }
            .frame(width: 22, height: 22)
            .opacity(row.reminded ? 0.4 : 1)
            .frame(width: Ns.touch, height: 52)
          }
          .buttonStyle(NsPress())
          .disabled(row.reminded)
          .accessibilityLabel(row.toggleLabel)

          Button { model.onOpen(row.id) } label: {
            HStack(spacing: Ns.s) {
              Text(row.initials)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(p.textSecondary))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color(p.surfaceMuted)))
              VStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                  .font(.system(size: 16))
                  .foregroundColor(Color(p.textPrimary))
                  .lineLimit(1)
                Text(row.seen)
                  .font(.system(size: 13))
                  .foregroundColor(Color(row.seenAlert ? p.errorText : p.textSecondary))
              }
              Spacer(minLength: 0)
              Text(row.status)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(row.progress ? p.warningText : p.textSecondary))
                .padding(.horizontal, Ns.xs)
                .padding(.vertical, Ns.xxs)
                .background(
                  RoundedRectangle(cornerRadius: Ns.radiusS)
                    .fill(Color(row.progress ? p.warning.withAlphaComponent(0.1) : p.surfaceMuted))
                )
            }
            .padding(.trailing, Ns.s)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
          }
          .buttonStyle(NsPress())
        }
        if index < model.rows.count - 1 {
          Rectangle().fill(Color(p.borderLight)).frame(height: 1)
        }
      }
    }
    .overlay(RoundedRectangle(cornerRadius: Ns.radiusL).strokeBorder(Color(p.border), lineWidth: 1))
    .clipShape(RoundedRectangle(cornerRadius: Ns.radiusL))
  }

  private var footer: some View {
    VStack(spacing: Ns.xs) {
      Rectangle().fill(Color(p.border)).frame(height: 1)
      Button { model.tap(["type": "send"]) } label: {
        HStack(spacing: Ns.xs) {
          if model.busy {
            ProgressView().tint(Color(p.onPrimary))
          } else {
            Image(systemName: model.sent ? "checkmark" : "paperplane")
              .font(.system(size: 16, weight: .semibold))
            Text(model.button).font(.system(size: 16, weight: .semibold))
          }
        }
        .foregroundColor(Color(p.onPrimary))
        .frame(maxWidth: .infinity, minHeight: Ns.button)
        .background(RoundedRectangle(cornerRadius: Ns.radiusM).fill(Color(model.sent ? p.successFill : p.primaryFill)))
      }
      .buttonStyle(NsPress())
      .disabled(!model.buttonEnabled || model.busy)
      .opacity(model.buttonEnabled || model.busy || model.sent ? 1 : 0.5)
      .padding(.horizontal, Ns.m)
      .accessibilityLabel(model.button)
      Text(model.hint)
        .font(.system(size: 12))
        .foregroundColor(Color(p.textSecondary))
        .multilineTextAlignment(.center)
        .padding(.horizontal, Ns.m)
        .padding(.bottom, Ns.s)
    }
    .background(Color(p.surface))
  }
}
