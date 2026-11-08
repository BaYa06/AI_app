//
//  AppUpdateSheet.m
//  Регистрация Swift-модуля AppUpdateSheetModule (нативная шторка «Вышла новая версия») в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(AppUpdateSheetModule, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options)

RCT_EXTERN_METHOD(dismiss)

@end
