//
//  FlashlyWidgetBridge.m
//  Регистрация Swift-модуля FlashlyWidgetBridge в React Native.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FlashlyWidgetBridge, NSObject)

RCT_EXTERN_METHOD(setSnapshot:(NSString *)json
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clear:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(readReveals:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(installedWidgets:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
