//
//  FlashlyWidgetBridge.swift
//  Мост JS → виджет на экране блокировки (plan/widgets.md, шаг 1.2).
//
//  Приложение кладёт готовое расписание (JSON из WidgetPlanner.ts) в общее хранилище App Group
//  и просит WidgetKit перечитать его. Сам виджет ничего не решает, только показывает записи.
//

import Foundation
import WidgetKit

@objc(FlashlyWidgetBridge)
class FlashlyWidgetBridge: NSObject {
  static let appGroup = "group.com.baiirbek.flashly"
  static let snapshotKey = "widgetSnapshot"
  static let revealsKey = "widgetReveals"

  @objc static func requiresMainQueueSetup() -> Bool { false }

  private var defaults: UserDefaults? { UserDefaults(suiteName: Self.appGroup) }

  @objc(setSnapshot:resolver:rejecter:)
  func setSnapshot(_ json: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = defaults else {
      reject("no_app_group", "App Group \(Self.appGroup) недоступна", nil)
      return
    }
    defaults.set(json, forKey: Self.snapshotKey)
    WidgetCenter.shared.reloadAllTimelines()
    resolve(nil)
  }

  /// Выход из аккаунта: виджет показывает «Войди в Flashly»
  @objc(clear:rejecter:)
  func clear(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    defaults?.removeObject(forKey: Self.snapshotKey)
    defaults?.removeObject(forKey: Self.revealsKey)
    WidgetCenter.shared.reloadAllTimelines()
    resolve(nil)
  }

  /// Нажатия «Показать» на виджете с прошлого раза (iOS 17+, шаг 2.2); счётчик сбрасывается
  @objc(readReveals:rejecter:)
  func readReveals(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let count = defaults?.integer(forKey: Self.revealsKey) ?? 0
    if count > 0 { defaults?.set(0, forKey: Self.revealsKey) }
    resolve(count)
  }

  /// Размеры виджетов Flashly, которые сейчас стоят на экране блокировки
  @objc(installedWidgets:rejecter:)
  func installedWidgets(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    WidgetCenter.shared.getCurrentConfigurations { result in
      switch result {
      case .success(let infos):
        resolve(infos.map { String(describing: $0.family) })
      case .failure(let error):
        reject("widget_configurations", error.localizedDescription, error)
      }
    }
  }
}
