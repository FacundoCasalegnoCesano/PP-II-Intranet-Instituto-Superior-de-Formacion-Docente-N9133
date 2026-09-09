<script setup lang="ts">
import type { EnrolledStudent } from '../types/teacherCourses'

const props = defineProps<{ students: EnrolledStudent[]; courseId: number; anioLectivo: number }>()
</script>

<template>
  <div class="mt-5">
    <table class="hidden w-full border-collapse text-left md:table" aria-label="Alumnos inscriptos">
      <thead>
        <tr class="border-b border-[var(--color-border)] text-sm text-[var(--color-graphite)]">
          <th scope="col" class="px-3 py-3 font-semibold">Apellido y nombre</th>
          <th scope="col" class="px-3 py-3 font-semibold">DNI</th>
          <th scope="col" class="px-3 py-3 font-semibold">Accesos</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="student in props.students" :key="student.alumnoId" class="border-b border-[var(--color-border)]">
          <th scope="row" class="px-3 py-4 font-semibold">{{ student.apellidoNombre }}</th>
          <td class="px-3 py-4">{{ student.dni }}</td>
          <td class="px-3 py-4"><div class="flex flex-wrap gap-3"><RouterLink :to="{ name: 'teacher-course-classes', params: { id: props.courseId }, query: { anioLectivo: String(props.anioLectivo) } }" class="font-semibold text-[var(--color-brand)]">Clases</RouterLink><RouterLink :to="{ name: 'teacher-course-grades', params: { id: props.courseId }, query: { anioLectivo: String(props.anioLectivo) } }" class="font-semibold text-[var(--color-brand)]">Calificaciones</RouterLink><RouterLink :to="{ name: 'teacher-course-summary', params: { id: props.courseId }, query: { anioLectivo: String(props.anioLectivo) } }" class="font-semibold text-[var(--color-brand)]">Resumen</RouterLink></div></td>
        </tr>
      </tbody>
    </table>

    <ul class="grid gap-3 md:hidden" aria-label="Alumnos inscriptos en tarjetas">
      <li v-for="student in props.students" :key="student.alumnoId" class="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h3 class="font-semibold">{{ student.apellidoNombre }}</h3>
        <p class="mt-1 text-sm text-[var(--color-graphite)]">DNI {{ student.dni }}</p>
        <div class="mt-3 flex flex-wrap gap-3 text-sm"><RouterLink :to="{ name: 'teacher-course-classes', params: { id: props.courseId }, query: { anioLectivo: String(props.anioLectivo) } }" class="font-semibold text-[var(--color-brand)]">Clases</RouterLink><RouterLink :to="{ name: 'teacher-course-grades', params: { id: props.courseId }, query: { anioLectivo: String(props.anioLectivo) } }" class="font-semibold text-[var(--color-brand)]">Calificaciones</RouterLink><RouterLink :to="{ name: 'teacher-course-summary', params: { id: props.courseId }, query: { anioLectivo: String(props.anioLectivo) } }" class="font-semibold text-[var(--color-brand)]">Resumen</RouterLink></div>
      </li>
    </ul>
  </div>
</template>
