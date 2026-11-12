//
//  TestTypeSheet.m
//  Регистрация Swift-модуля TestTypeSheetModule (нативный лист «Выбери тип теста») в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(TestTypeSheetModule, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options)

RCT_EXTERN_METHOD(dismiss)

@end
