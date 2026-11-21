//
//  JoinCodeSheet.m
//  Регистрация Swift-модуля JoinCodeSheetModule (нативный лист «Код подключения к курсу») в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(JoinCodeSheetModule, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options)

RCT_EXTERN_METHOD(update:(NSDictionary *)state)

RCT_EXTERN_METHOD(dismiss)

@end
