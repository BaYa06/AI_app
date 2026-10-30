//
//  ShareSetActions.swift
//  Набор по ссылке: меню «…» и лист жалобы (plan/new/share_set.md, Share 6).
//
//  Как в последних версиях (plan/new/liquid_glass.md, Glass 0 и 7): на iOS 26 меню и лист
//  системные — со стеклом и плавной пружиной.
//  - ShareMenuButton — кнопка «…» с UIMenu (showsMenuAsPrimaryAction). Пункты приходят из JS,
//    выбор — событием onSelect { id }.
//  - ShareReportSheetModule.present(options) → Promise { reason, comment } | null — лист
//    UISheetPresentationController с содержимым на SwiftUI (по образцу StudyModeSheet.swift).
//  Подтверждение блокировки — Alert.alert из JS: на iOS это и есть системный UIAlertController.
//

import SwiftUI
import UIKit

// MARK: - Меню «…»

// Имя для Objective-C обязательно: без @objc(…) класс в рантайме называется FlashcardsApp.ShareMenuButton,
// и RCT_EXTERN_MODULE в ShareSetActions.m не находит его при линковке
@objc(ShareMenuButton)
class ShareMenuButton: RCTView {
  /// [{ id, title, subtitle?, symbol?, destructive? }]
  @objc var items: NSArray = [] { didSet { rebuildMenu() } }
  @objc var menuTitle: NSString = "" { didSet { rebuildMenu() } }
  @objc var tint: UIColor? { didSet { button.tintColor = tint } }
  @objc var onSelect: RCTDirectEventBlock?

  private let button = UIButton(type: .system)

  override init(frame: CGRect) {
    super.init(frame: frame)
    let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
    button.setImage(UIImage(systemName: "ellipsis", withConfiguration: config), for: .normal)
    button.showsMenuAsPrimaryAction = true
    button.accessibilityLabel = "Ещё"
    button.translatesAutoresizingMaskIntoConstraints = false
    addSubview(button)
    NSLayoutConstraint.activate([
      button.leadingAnchor.constraint(equalTo: leadingAnchor),
      button.trailingAnchor.constraint(equalTo: trailingAnchor),
      button.topAnchor.constraint(equalTo: topAnchor),
      button.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  private func rebuildMenu() {
    let actions: [UIMenuElement] = items.compactMap { $0 as? NSDictionary }.map { item in
      let id = item["id"] as? String ?? ""
      let image = (item["symbol"] as? String).flatMap { UIImage(systemName: $0) }
      let destructive = item["destructive"] as? Bool ?? false
      let action = UIAction(title: item["title"] as? String ?? "", image: image, attributes: destructive ? .destructive : []) { [weak self] _ in
        self?.onSelect?(["id": id])
      }
      if let subtitle = item["subtitle"] as? String, !subtitle.isEmpty {
        action.subtitle = subtitle
      }
      return action
    }
    button.menu = UIMenu(title: menuTitle as String, children: actions)
  }
}

@objc(ShareMenuButtonManager)
class ShareMenuButtonManager: RCTViewManager {
  override func view() -> UIView! { ShareMenuButton() }

  override static func requiresMainQueueSetup() -> Bool { true }
}

// MARK: - Лист жалобы

@objc(ShareReportSheetModule)
class ShareReportSheetModule: NSObject, UISheetPresentationControllerDelegate {
  private weak var presented: UIViewController?
  private var resolve: RCTPromiseResolveBlock?

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(present:resolver:rejecter:)
  func present(_ options: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { self.presentSheet(options, resolve: resolve) }
  }

  /// Отдаёт результат в JS ровно один раз (кнопка, «Отмена» или свайп вниз)
  private func finish(_ result: Any?) {
    let resolve = self.resolve
    self.resolve = nil
    resolve?(result ?? NSNull())
  }

  private func presentSheet(_ options: NSDictionary, resolve: @escaping RCTPromiseResolveBlock) {
    guard presented == nil, let top = RCTPresentedViewController() else {
      resolve(NSNull())
      return
    }
    self.resolve = resolve

    let palette = StudyModePalette(options["colors"] as? NSDictionary ?? [:])
    let reasons = (options["reasons"] as? [NSDictionary] ?? []).map {
      ShareReportReason(id: $0["id"] as? String ?? "", title: $0["title"] as? String ?? "")
    }
    let model = ShareReportSheetModel(
      title: options["title"] as? String ?? "",
      subtitle: options["subtitle"] as? String ?? "",
      reasons: reasons,
      palette: palette
    )

    let host = UIHostingController(rootView: ShareReportSheetView(model: model))
    host.view.backgroundColor = palette.surface
    host.overrideUserInterfaceStyle = (options["dark"] as? Bool ?? false) ? .dark : .light

    model.onCancel = { [weak self, weak host] in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      host.dismiss(animated: true) { self.finish(nil) }
    }
    model.onSubmit = { [weak self, weak host] reason, comment in
      guard let self, let host, self.presented === host else { return }
      self.presented = nil
      host.dismiss(animated: true) { self.finish(["reason": reason, "comment": comment]) }
    }

    host.modalPresentationStyle = .pageSheet
    if let sheet = host.sheetPresentationController {
      sheet.detents = [.medium(), .large()]
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
    finish(nil)
  }
}

struct ShareReportReason: Identifiable {
  let id: String
  let title: String
}

final class ShareReportSheetModel: ObservableObject {
  let title: String
  let subtitle: String
  let reasons: [ShareReportReason]
  let palette: StudyModePalette
  @Published var selected: String?
  @Published var comment = ""

  var onSubmit: (String, String) -> Void = { _, _ in }
  var onCancel: () -> Void = {}

  init(title: String, subtitle: String, reasons: [ShareReportReason], palette: StudyModePalette) {
    self.title = title
    self.subtitle = subtitle
    self.reasons = reasons
    self.palette = palette
  }
}

/// Отступы и скругления — токены из src/constants/spacing.ts
private enum ReportMetrics {
  static let xxs: CGFloat = 4
  static let xs: CGFloat = 8
  static let s: CGFloat = 12
  static let m: CGFloat = 16
  static let l: CGFloat = 24
  static let radiusM: CGFloat = 12
  static let radiusL: CGFloat = 16
  static let row: CGFloat = 52
  static let button: CGFloat = 52
  static let touch: CGFloat = 44
}

struct ShareReportSheetView: View {
  @ObservedObject var model: ShareReportSheetModel
  private var p: StudyModePalette { model.palette }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: ReportMetrics.s) {
        Text(model.title)
          .font(.system(size: 20, weight: .semibold))
          .foregroundColor(Color(p.textPrimary))
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        Button("Отмена") { model.onCancel() }
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(p.textSecondary))
          .frame(minHeight: ReportMetrics.touch)
      }
      .padding(.top, ReportMetrics.l)

      Text(model.subtitle)
        .font(.system(size: 14))
        .foregroundColor(Color(p.textSecondary))
        .padding(.bottom, ReportMetrics.m)

      ScrollView(showsIndicators: false) {
        VStack(spacing: ReportMetrics.s) {
          VStack(spacing: 0) {
            ForEach(Array(model.reasons.enumerated()), id: \.element.id) { index, reason in
              if index > 0 {
                Rectangle().fill(Color(p.border)).frame(height: 1).padding(.leading, ReportMetrics.m)
              }
              reasonRow(reason)
            }
          }
          .background(Color(p.surface))
          .overlay(RoundedRectangle(cornerRadius: ReportMetrics.radiusL).stroke(Color(p.border), lineWidth: 1))
          .clipShape(RoundedRectangle(cornerRadius: ReportMetrics.radiusL))

          if model.selected == "other" {
            TextField("Что именно не так?", text: $model.comment)
              .font(.system(size: 16))
              .foregroundColor(Color(p.textPrimary))
              .padding(.horizontal, ReportMetrics.m)
              .frame(minHeight: 48)
              .overlay(RoundedRectangle(cornerRadius: ReportMetrics.radiusM).stroke(Color(p.border), lineWidth: 1))
          }
        }
      }

      Button {
        if let reason = model.selected {
          model.onSubmit(reason, model.comment.trimmingCharacters(in: .whitespacesAndNewlines))
        }
      } label: {
        Text("Отправить")
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(Color(p.onPrimary))
          .frame(maxWidth: .infinity, minHeight: ReportMetrics.button)
          .background(Color(p.primaryFill))
          .clipShape(RoundedRectangle(cornerRadius: ReportMetrics.radiusM))
      }
      .disabled(model.selected == nil)
      .opacity(model.selected == nil ? 0.5 : 1)
      .padding(.vertical, ReportMetrics.s)
    }
    .padding(.horizontal, ReportMetrics.m)
    .background(Color(p.surface).ignoresSafeArea())
  }

  private func reasonRow(_ reason: ShareReportReason) -> some View {
    let selected = model.selected == reason.id
    return Button {
      model.selected = reason.id
    } label: {
      HStack(spacing: ReportMetrics.s) {
        Text(reason.title)
          .font(.system(size: 16, weight: selected ? .semibold : .regular))
          .foregroundColor(Color(p.textPrimary))
        Spacer(minLength: 0)
        if selected {
          Image(systemName: "checkmark")
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(Color(p.primary))
        }
      }
      .padding(.horizontal, ReportMetrics.m)
      .frame(minHeight: ReportMetrics.row)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
