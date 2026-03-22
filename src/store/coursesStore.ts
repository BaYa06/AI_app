/**
 * Store для курсов
 * @description Управление курсами (папками/контейнерами для наборов)
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuid } from 'uuid';
import type { Course } from '@/types';
import { StorageService, STORAGE_KEYS } from '@/services/StorageService';
import { NeonService } from '@/services/NeonService';
import { supabase } from '@/services/supabaseClient';

// Lazy import для useSetsStore чтобы избежать циклических зависимостей
const getSetsStore = () => require('./setsStore').useSetsStore;

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'; // Валидный UUID для локального пользователя

interface CoursesState {
  // Данные
  courses: Course[];
  activeCourseId: string | null; // null = "All courses"
  
  // Загрузка
  isLoading: boolean;
  error: string | null;
}

interface CoursesActions {
  // CRUD
  createCourse: (title: string) => Course;
  renameCourse: (id: string, title: string) => void;
  deleteCourse: (id: string) => void;
  removeLocalCourse: (id: string) => void;

  // Выбор активного курса
  setActiveCourse: (id: string | null) => void;
  
  // Селекторы
  getCourse: (id: string) => Course | undefined;
  getActiveCourse: () => Course | undefined;
  
  // Состояние
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Загрузка/сохранение
  loadCourses: () => void;
  saveCourses: () => void;
  clearCourses: () => void;
}

export const useCoursesStore = create<CoursesState & CoursesActions>()(
  immer((set, get) => ({
    // Начальное состояние
    courses: [],
    activeCourseId: null,
    isLoading: false,
    error: null,

    // ==================== CRUD ====================
    
    createCourse: (title) => {
      const now = Date.now();
      const newCourse: Course = {
        id: uuid(),
        title: title.trim(),
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        state.courses.push(newCourse);
      });

      // Сохраняем в хранилище
      get().saveCourses();
      console.log('✅ Курс создан:', newCourse.title);

      // Синхронизируем с Neon (async, только для авторизованных пользователей)
      if (NeonService.isEnabled()) {
        console.log('🔄 Отправка курса в Neon PostgreSQL...');
        (async () => {
          // Получаем текущего пользователя
          const { data: sessionData } = await supabase.auth.getSession();
          const currentUserId = sessionData.session?.user?.id;

          if (!currentUserId) {
            console.log('ℹ️  Пользователь не авторизован, курс сохранен только локально');
            return;
          }

          const ok = await NeonService.createCourse({
            id: newCourse.id,
            userId: currentUserId,
            title: newCourse.title,
            createdAt: newCourse.createdAt,
          });
          if (ok) {
            console.log('✅ Курс сохранен в Neon PostgreSQL:', newCourse.title);
          } else {
            console.warn('⚠️  Не удалось синхронизировать курс с Neon:', newCourse.title);
          }
        })();
      }

      return newCourse;
    },

    renameCourse: (id, title) => {
      set((state) => {
        const course = state.courses.find((c) => c.id === id);
        if (course) {
          course.title = title.trim();
          course.updatedAt = Date.now();
        }
      });

      // Сохраняем в хранилище
      get().saveCourses();
      console.log('✅ Курс переименован:', title);

      // Синхронизируем с Neon (async)
      if (NeonService.isEnabled()) {
        console.log('🔄 Обновление курса в Neon PostgreSQL...');
        (async () => {
          const ok = await NeonService.renameCourse(id, title.trim());
          if (ok) {
            console.log('✅ Курс обновлен в Neon PostgreSQL:', title);
          } else {
            console.warn('⚠️  Не удалось обновить курс в Neon:', title);
          }
        })();
      }
    },

    deleteCourse: (id) => {
      const state = get();
      
      // Если удаляем активный курс, переключаемся на "All"
      if (state.activeCourseId === id) {
        set((s) => {
          s.activeCourseId = null;
        });
      }

      set((s) => {
        const index = s.courses.findIndex((c) => c.id === id);
        if (index > -1) {
          s.courses.splice(index, 1);
        }
      });

      // Перемещаем все наборы из этого курса в "All"
      const setsStore = getSetsStore().getState();
      setsStore.moveSetsFromCourse(id);

      // Сохраняем в хранилище
      get().saveCourses();
      console.log('✅ Курс удален:', id);

      // Синхронизируем с Neon (async)
      if (NeonService.isEnabled()) {
        console.log('🔄 Удаление курса из Neon PostgreSQL...');
        (async () => {
          const ok = await NeonService.deleteCourse(id);
          if (ok) {
            console.log('✅ Курс удален из Neon PostgreSQL');
          } else {
            console.warn('⚠️  Не удалось удалить курс из Neon');
          }
        })();
      }
    },

    removeLocalCourse: (id) => {
      const state = get();
      if (state.activeCourseId === id) {
        set((s) => { s.activeCourseId = null; });
      }
      set((s) => {
        const index = s.courses.findIndex((c) => c.id === id);
        if (index > -1) s.courses.splice(index, 1);
      });
      const setsStore = getSetsStore().getState();
      setsStore.moveSetsFromCourse(id);
      get().saveCourses();
    },

    // ==================== ВЫБОР КУРСА ====================

    setActiveCourse: (id) => {
      set((state) => {
        state.activeCourseId = id;
      });

      // Сохраняем в хранилище
      get().saveCourses();
      console.log('✅ Активный курс:', id || 'All');
    },

    // ==================== СЕЛЕКТОРЫ ====================
    
    getCourse: (id) => {
      return get().courses.find((c) => c.id === id);
    },

    getActiveCourse: () => {
      const { courses, activeCourseId } = get();
      if (!activeCourseId) return undefined;
      return courses.find((c) => c.id === activeCourseId);
    },

    // ==================== СОСТОЯНИЕ ====================
    
    setLoading: (isLoading) => {
      set((state) => {
        state.isLoading = isLoading;
      });
    },

    setError: (error) => {
      set((state) => {
        state.error = error;
      });
    },

    // ==================== ЗАГРУЗКА/СОХРАНЕНИЕ ====================
    
    loadCourses: () => {
      try {
        const data = StorageService.getObject<{
          courses: Course[];
          activeCourseId: string | null;
        }>(STORAGE_KEYS.COURSES);

        if (data) {
          set((state) => {
            state.courses = data.courses || [];
            state.activeCourseId = data.activeCourseId ?? null;
          });
          console.log('✅ Курсы загружены:', data.courses?.length || 0);
        }
      } catch (error) {
        console.error('❌ Ошибка загрузки курсов:', error);
      }
    },

    saveCourses: () => {
      try {
        const { courses, activeCourseId } = get();
        StorageService.setObject(STORAGE_KEYS.COURSES, {
          courses,
          activeCourseId,
        });
      } catch (error) {
        console.error('❌ Ошибка сохранения курсов:', error);
      }
    },

    clearCourses: () => {
      set((state) => {
        state.courses = [];
        state.activeCourseId = null;
        state.error = null;
      });
    },
  }))
);
