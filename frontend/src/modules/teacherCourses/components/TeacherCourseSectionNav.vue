<script setup lang="ts">
import type { TeacherCourseSection } from '../types/teacherCourses'

const props = defineProps<{
  courseId: number
  section: TeacherCourseSection
  anioLectivo: number
}>()

const sections: Array<{ key: TeacherCourseSection; label: string; route: string }> = [
  { key: 'students', label: 'Alumnos', route: 'teacher-course-students' },
  { key: 'classes', label: 'Clases', route: 'teacher-course-classes' },
  { key: 'grades', label: 'Calificaciones', route: 'teacher-course-grades' },
  { key: 'summary', label: 'Resumen', route: 'teacher-course-summary' },
]
</script>

<template>
  <nav aria-label="Secciones de la cursada" class="border-b border-[var(--color-border)]">
    <ul class="flex gap-1 overflow-x-auto" role="list">
      <li v-for="item in sections" :key="item.key">
        <RouterLink
          :to="{ name: item.route, params: { id: props.courseId }, query: { anioLectivo: String(props.anioLectivo) } }"
          class="block min-h-11 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]"
          :class="props.section === item.key ? 'border-[var(--color-brand)] text-[var(--color-brand)]' : 'border-transparent text-[var(--color-graphite)] hover:border-[var(--color-border)]'"
          :aria-current="props.section === item.key ? 'page' : undefined"
        >
          {{ item.label }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
