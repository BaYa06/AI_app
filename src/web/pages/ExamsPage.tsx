/**
 * «Экзамены» (plan/new/web_cabinet.md, Web 12; макет E0): все экзамены учителя + «Новый экзамен».
 * Из этой страницы экзамен создаётся для выбранного курса (если курс один — сразу к настройкам).
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { spacing } from '@/constants';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Sheet';
import { navigate } from '../router';
import { useCourses } from '../data/CoursesContext';
import { ExamData } from '../data/exam';
import { useLoad } from '../useLoad';
import { ExamList } from '../exam/ExamList';
import { ErrorPage, LoadingPage } from '../ui/states';
import { PageHeader } from '../ui/kit';

export function NewExamButton({ courseId, size = 's' }: { courseId?: string; size?: 's' | 'l' }) {
  const { courses } = useCourses();
  const [picking, setPicking] = useState(false);

  const start = () => {
    if (courseId) navigate(`/courses/${courseId}/exams/new`);
    else if (courses && courses.length === 1) navigate(`/courses/${courses[0].id}/exams/new`);
    else setPicking(true);
  };

  return (
    <>
      <Button
        title="Новый экзамен"
        icon={Plus}
        size={size}
        onPress={start}
        disabled={!courses?.length && !courseId}
      />
      <Dialog visible={picking} onClose={() => setPicking(false)} title="Для какого курса?">
        <View style={{ paddingHorizontal: spacing.m, paddingBottom: spacing.m, gap: spacing.xs }}>
          {(courses ?? []).map((c) => (
            <Button
              key={c.id}
              variant="secondary"
              title={c.title}
              fullWidth
              onPress={() => {
                setPicking(false);
                navigate(`/courses/${c.id}/exams/new`);
              }}
            />
          ))}
        </View>
      </Dialog>
    </>
  );
}

export function ExamsPage() {
  const list = useLoad(() => ExamData.list(), []);
  const { courses } = useCourses();

  return (
    <View>
      <PageHeader
        title="Экзамены"
        actions={courses && courses.length > 0 ? <NewExamButton /> : null}
      />
      {list.data ? (
        <ExamList items={list.data} showCourse />
      ) : list.error ? (
        <ErrorPage error={list.error} onRetry={list.reload} />
      ) : (
        <LoadingPage />
      )}
    </View>
  );
}
