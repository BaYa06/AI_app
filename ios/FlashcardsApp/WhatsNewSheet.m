//
//  WhatsNewSheet.m
//  Регистрация Swift-модуля WhatsNewSheetModule (нативная шторка «Что нового») в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(WhatsNewSheetModule, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options)

RCT_EXTERN_METHOD(dismiss)

@end
