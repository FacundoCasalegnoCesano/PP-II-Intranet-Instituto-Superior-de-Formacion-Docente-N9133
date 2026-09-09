<script setup lang="ts">
import { academicLabel } from '@/core/presentation/academicLabels'
import type { TeacherCourse, TeacherCourseSection } from '../types/teacherCourses'

const props = defineProps<{ courses: TeacherCourse[]; currentYear: number; section: TeacherCourseSection }>()
const emit = defineEmits<{ select: [course: TeacherCourse] }>()

function courseIsCurrent(course: TeacherCourse): boolean {
  return (course.editable ?? (course.activo && course.anioLectivo === props.currentYear)) && course.anioLectivo === props.currentYear
}

function sectionActionLabel(): string {
  return {
    students: 'Ver alumnos',
    classes: 'Ver clases',
    grades: 'Ver calificaciones',
    summary: 'Ver resumen',
  }[props.section]
}
</script>

<template>
  <div class="mt-5">
    <table class="hidden w-full border-collapse text-left md:table" aria-label="Mis cursadas">
      <thead>
        <tr class="border-b border-[var(--color-border)] text-sm text-[var(--color-graphite)]">
          <th scope="col" class="px-3 py-3 font-semibold">Materia</th>
          <th scope="col" class="px-3 py-3 font-semibold">Carrera</th>
          <th scope="col" class="px-3 py-3 font-semibold">Ciclo lectivo</th>
          <th scope="col" class="px-3 py-3 font-semibold">Estado</th>
          <th scope="col" class="px-3 py-3 text-right font-semibold"><span class="sr-only">Acción</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="course in courses" :key="course.id" class="border-b border-[var(--color-border)]">
          <th scope="row" class="px-3 py-4 font-semibold text-[var(--color-text)]">{{ course.materia.nombre }}</th>
          <td class="px-3 py-4 text-[var(--color-graphite)]">{{ course.materia.carrera?.nombre ?? 'Carrera no informada' }}</td>
          <td class="px-3 py-4">{{ course.anioLectivo }} · {{ academicLabel(course.periodo) }}</td>
          <td class="px-3 py-4">
            <span class="font-semibold" :class="courseIsCurrent(course) ? 'text-[var(--color-brand)]' : 'text-[var(--color-graphite)]'">
              {{ courseIsCurrent(course) ? 'Cursada actual' : 'Cursada histórica' }}
            </span>
          </td>
          <td class="px-3 py-4 text-right"><button type="button" class="min-h-10 rounded-md border border-[var(--color-brand)] px-3 font-semibold text-[var(--color-brand)]" @click="emit('select', course)">{{ sectionActionLabel() }}</button></td>
        </tr>
      </tbody>
    </table>

    <ul class="grid gap-3 md:hidden" aria-label="Mis cursadas en tarjetas">
      <li v-for="course in courses" :key="course.id" class="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h3 class="font-semibold text-[var(--color-text)]">{{ course.materia.nombre }}</h3>
        <p class="mt-1 text-sm text-[var(--color-graphite)]">{{ course.materia.carrera?.nombre ?? 'Carrera no informada' }}</p>
        <p class="mt-3 text-sm">{{ course.anioLectivo }} · {{ academicLabel(course.periodo) }}</p>
        <p class="mt-1 text-sm font-semibold" :class="courseIsCurrent(course) ? 'text-[var(--color-brand)]' : 'text-[var(--color-graphite)]'">
          {{ courseIsCurrent(course) ? 'Cursada actual' : 'Cursada histórica' }}
        </p>
        <button type="button" class="mt-4 min-h-10 rounded-md border border-[var(--color-brand)] px-3 font-semibold text-[var(--color-brand)]" @click="emit('select', course)">{{ sectionActionLabel() }}</button>
      </li>
    </ul>
  </div>
</template>
