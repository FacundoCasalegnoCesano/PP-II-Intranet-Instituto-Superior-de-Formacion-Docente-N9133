<template>
  <AuthLayout>
    <article class="mt-8" aria-labelledby="presentation-title">
      <nav class="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Navegación pública">
        <RouterLink :to="{ name: 'login' }" class="font-semibold text-[var(--color-brand)] hover:underline">Ingresar</RouterLink>
        <RouterLink :to="{ name: 'privacy' }" class="font-semibold text-[var(--color-brand)] hover:underline">Privacidad</RouterLink>
      </nav>

      <div class="mt-10">
        <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Instituto Superior de Formación Docente N.º 9133</p>
        <h1 id="presentation-title" class="mt-2 text-3xl font-semibold leading-tight text-[var(--color-text)]">Una intranet para acompañar la vida académica</h1>
        <p class="mt-4 text-lg leading-7 text-[var(--color-graphite)]">Este espacio reúne la información y las gestiones académicas del ISFD N.º 9133 para que cada integrante de la comunidad pueda consultar lo que necesita desde una misma cuenta.</p>
      </div>

      <section class="mt-8 border-t border-[var(--color-border)] pt-6" aria-labelledby="purpose-title">
        <h2 id="purpose-title" class="text-xl font-semibold text-[var(--color-text)]">Un espacio según cada rol</h2>
        <p class="mt-2 leading-6 text-[var(--color-graphite)]">La gestión se organiza de acuerdo con el rol autorizado de cada cuenta: estudiantes, profesores y personal administrativo acceden a las funciones que corresponden a su tarea.</p>
        <dl class="mt-5 space-y-4">
          <div class="border-l-4 border-[var(--color-brand)] pl-4">
            <dt class="font-semibold text-[var(--color-text)]">Trayectorias e inscripciones</dt>
            <dd class="mt-1 text-sm leading-6 text-[var(--color-graphite)]">Consulta de carreras, materias, inscripciones y el estado de la trayectoria académica informado por la institución.</dd>
          </div>
          <div class="border-l-4 border-[var(--color-brand)] pl-4">
            <dt class="font-semibold text-[var(--color-text)]">Cursadas y evaluaciones</dt>
            <dd class="mt-1 text-sm leading-6 text-[var(--color-graphite)]">Organización de cursadas, asistencia, calificaciones, horarios y mesas de examen según las atribuciones de cada rol.</dd>
          </div>
          <div class="border-l-4 border-[var(--color-brand)] pl-4">
            <dt class="font-semibold text-[var(--color-text)]">Administración institucional</dt>
            <dd class="mt-1 text-sm leading-6 text-[var(--color-graphite)]">Gestión de usuarios, roles y datos académicos por parte de las cuentas administrativas autorizadas.</dd>
          </div>
        </dl>
      </section>

      <section class="mt-8 rounded-lg border border-[var(--color-border)] bg-white p-5" aria-labelledby="access-title">
        <h2 id="access-title" class="text-xl font-semibold text-[var(--color-text)]">¿Ya tenés una cuenta?</h2>
        <p class="mt-2 leading-6 text-[var(--color-graphite)]">Ingresá con tu correo electrónico o DNI institucional para continuar.</p>
        <RouterLink :to="{ name: 'login' }" class="mt-5 inline-flex min-h-11 items-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white hover:bg-[#74151a]">Ingresar a la intranet</RouterLink>
      </section>

      <p class="mt-7 text-sm leading-6 text-[var(--color-graphite)]">Para conocer el tratamiento previsto de la información, consultá la <RouterLink :to="{ name: 'privacy' }" class="font-semibold text-[var(--color-brand)] underline">política de privacidad</RouterLink>.</p>
    </article>
  </AuthLayout>
</template>

<script setup lang="ts">
import AuthLayout from '@/layouts/AuthLayout.vue'
</script>
