//
//  NewCourseSheet.m
//  Регистрация Swift-модуля NewCourseSheetModule (нативное окно «Новый курс» учителя) в React Native.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(NewCourseSheetModule, RCTEventEmitter)

RCT_EXTERN_METHOD(present:(NSDictionary *)options)

RCT_EXTERN_METHOD(setBooks:(NSArray *)books)

RCT_EXTERN_METHOD(setBusy:(BOOL)busy)

RCT_EXTERN_METHOD(finish)

RCT_EXTERN_METHOD(dismiss)

@end
