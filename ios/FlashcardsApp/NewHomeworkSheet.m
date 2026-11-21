//
//  NewHomeworkSheet.m
//  Регистрация Swift-модуля NewHomeworkSheetModule (окна «Новое задание» и «Слова для задания»
//  учителя) в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(NewHomeworkSheetModule, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options)

RCT_EXTERN_METHOD(setSets:(NSArray *)sets)

RCT_EXTERN_METHOD(setHardCards:(NSArray *)cardIds)

RCT_EXTERN_METHOD(setBusy:(BOOL)busy)

RCT_EXTERN_METHOD(setError:(NSString *)message)

RCT_EXTERN_METHOD(finish)

RCT_EXTERN_METHOD(dismiss)

@end
