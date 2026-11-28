/**
 * Страница курса (plan/new/web_cabinet.md, Web 7, 10): шапка, вкладки в адресе (?tab=), действия курса.
 * «Задания», «Экзамены» и «Отчёт родителям» — честные заглушки до своих этапов.
 */
import React, { useState } from 'react';
import {
  ClipboardList,
  FileText,
  GraduationCap,
  MoreHorizontal,
  UserPlus,
} from 'lucide-react-native';
import { View } from 'react-native';
import { spacing } from '@/constants';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toast';
import { formatScheduleLabel } from '@/screens/teacherCourseStats/courseOverview';
import { navigate, useQuery } from '../router';
import { useCourses } from '../data/CoursesContext';
import { TeacherData } from '../data/teacher';
import { useLoad } from '../useLoad';
import { studentsCountLabel } from '../teacherLogic';
import { Centered, ErrorPage, LoadingPage, NotFoundPage } from '../ui/states';
import { PageHeader, TabBar, type TabItem } from '../ui/kit';
import { StudentsTab } from '../courses/StudentsTab';
import { ExamData } from '../data/exam';
import { ExamList } from '../exam/ExamList';
import { NewExamButton } from './ExamsPage';
import {
  CourseMenuDialog,
  DeleteCourseDialog,
  InviteDialog,
  RenameCourseDialog,
} from '../courses/CourseDialogs';

type TabKey = 'students' | 'homework' | 'exams' | 'report';
const TABS: TabItem<TabKey>[] = [
  { key: 'students', label: 'Ученики' },
  { key: 'homework', label: 'Задания' },
  { key: 'exams', label: 'Экзамены' },
  { key: 'report', label: 'Отчёт родителям' },
];

const STUBS: Record<
  Exclude<TabKey, 'students' | 'exams'>,
  { icon: typeof FileText; title: string }
> = {
  homework: { icon: ClipboardList, title: 'Задания скоро будут в кабинете' },
  report: { icon: FileText, title: 'Отчёт родителям скоро будет в кабинете' },
};

/** Вкладка «Экзамены» курса: список этого курса и «Новый экзамен» */
function CourseExams({ courseId }: { courseId: string }) {
  const list = useLoad(() => ExamData.list(courseId), [courseId]);
  if (list.error && !list.data) return <ErrorPage error={list.error} onRetry={list.reload} />;
  if (!list.data) return <LoadingPage />;
  return (
    <View style={{ gap: spacing.m }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <NewExamButton courseId={courseId} />
      </View>
      <ExamList
        items={list.data}
        showCourse={false}
        empty={
          <Centered>
            <EmptyState
              icon={GraduationCap}
              title="В этом курсе ещё не было экзаменов"
              description="Нажми «Новый экзамен»: выбери набор, число слов и форматы — кабинет соберёт вопросы."
            />
          </Centered>
        }
      />
    </View>
  );
}

export function CoursePage({ courseId }: { courseId: string }) {
  const { courses, coursesError, reloadCourses } = useCourses();
  const query = useQuery();
  const tab = (TABS.find((t) => t.key === query.get('tab'))?.key ?? 'students') as TabKey;

  const [inviting, setInviting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const members = useLoad(() => TeacherData.members(courseId), [courseId]);
  const schedule = useLoad(() => TeacherData.schedule(courseId), [courseId]);

  if (!courses) {
    return coursesError ? (
      <ErrorPage error={coursesError} onRetry={reloadCourses} />
    ) : (
      <LoadingPage />
    );
  }
  const course = courses.find((c) => c.id === courseId);
  if (!course) return <NotFoundPage />;

  const scheduleLabel = schedule.data ? formatScheduleLabel(schedule.data) : null;
  const subtitle = [members.data ? studentsCountLabel(members.data.length) : null, scheduleLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      <PageHeader
        title={course.title}
        subtitle={subtitle || null}
        back={{ label: 'Обзор', path: '/' }}
        actions={
          <>
            <Button
              variant="icon"
              icon={MoreHorizontal}
              accessibilityLabel="Ещё"
              onPress={() => setMenu(true)}
            />
            <Button title="Пригласить" icon={UserPlus} size="s" onPress={() => setInviting(true)} />
          </>
        }
      />
      <TabBar
        tabs={TABS}
        active={tab}
        onChange={(key) =>
          navigate(`/courses/${courseId}${key === 'students' ? '' : `?tab=${key}`}`, {
            replace: true,
          })
        }
      />
      {tab === 'students' ? (
        <StudentsTab course={course} members={members} />
      ) : tab === 'exams' ? (
        <CourseExams courseId={courseId} />
      ) : (
        <Centered>
          <EmptyState
            icon={STUBS[tab as 'homework' | 'report'].icon}
            title={STUBS[tab as 'homework' | 'report'].title}
            description="Пока это есть в приложении Flashly."
          />
        </Centered>
      )}

      <InviteDialog visible={inviting} course={course} onClose={() => setInviting(false)} />
      <CourseMenuDialog
        visible={menu}
        onClose={() => setMenu(false)}
        onRename={() => {
          setMenu(false);
          setRenaming(true);
        }}
        onDelete={() => {
          setMenu(false);
          setDeleting(true);
        }}
      />
      <RenameCourseDialog
        visible={renaming}
        course={course}
        onClose={() => setRenaming(false)}
        onRenamed={() => {
          setRenaming(false);
          reloadCourses();
          toast.success('Название сохранено');
        }}
      />
      <DeleteCourseDialog
        visible={deleting}
        course={course}
        studentsCount={members.data?.length ?? null}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          reloadCourses();
          toast.success('Курс удалён');
          navigate('/', { replace: true });
        }}
      />
    </View>
  );
}
