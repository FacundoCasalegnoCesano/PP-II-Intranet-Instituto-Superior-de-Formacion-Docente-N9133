<template>
  <AuthLayout>
    <article class="mt-8" aria-labelledby="privacy-title">
      <nav class="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Navegación pública">
        <RouterLink :to="{ name: 'login' }" class="font-semibold text-[var(--color-brand)] hover:underline">Ingresar</RouterLink>
        <RouterLink :to="{ name: 'presentation' }" class="font-semibold text-[var(--color-brand)] hover:underline">Presentación</RouterLink>
      </nav>

      <header class="mt-10">
        <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Información institucional</p>
        <h1 id="privacy-title" class="mt-2 text-3xl font-semibold leading-tight text-[var(--color-text)]">Política de privacidad</h1>
        <p class="mt-4 rounded-md border border-[#edb8b8] bg-[#fff7f6] p-4 text-sm leading-6 text-[#8b151b]">Borrador operativo para revisión institucional. Este contenido debe ser validado y completado por la institución antes de publicarse como política definitiva.</p>
      </header>

      <div class="mt-8 space-y-8 text-[var(--color-graphite)]">
        <section aria-labelledby="data-title">
          <h2 id="data-title" class="text-xl font-semibold text-[var(--color-text)]">Información que puede gestionarse</h2>
          <p class="mt-2 leading-6">La intranet puede tratar la información necesaria para administrar cuentas y acompañar gestiones académicas, de acuerdo con los formularios y funciones disponibles:</p>
          <ul class="mt-3 list-disc space-y-2 pl-5 leading-6">
            <li><strong class="text-[var(--color-text)]">Identificación y contacto:</strong> apellido y nombre, DNI, correo electrónico, fecha de nacimiento, teléfono, CUIL y contacto de emergencia, cuando correspondan.</li>
            <li><strong class="text-[var(--color-text)]">Información académica:</strong> carreras, materias, inscripciones, cursadas, asistencia, calificaciones, mesas de examen y homologaciones.</li>
            <li><strong class="text-[var(--color-text)]">Información de acceso:</strong> credenciales, estado de la cuenta, roles autorizados y datos técnicos necesarios para mantener la sesión y recuperar una contraseña.</li>
          </ul>
        </section>

        <section aria-labelledby="purpose-title">
          <h2 id="purpose-title" class="text-xl font-semibold text-[var(--color-text)]">Para qué se utiliza</h2>
          <p class="mt-2 leading-6">La información se utiliza para gestionar el acceso, las inscripciones, las asistencias, las calificaciones, las trayectorias académicas, los horarios, los exámenes y la recuperación de contraseñas, según corresponda al rol de la cuenta.</p>
        </section>

        <section aria-labelledby="access-title">
          <h2 id="access-title" class="text-xl font-semibold text-[var(--color-text)]">Acceso por rol y operación técnica</h2>
          <p class="mt-2 leading-6">Las cuentas autorizadas acceden a la información y acciones que corresponden a su rol dentro de la institución. La operación técnica puede involucrar a Vercel para el frontend, Railway para el backend y la base de datos, y Google para servicios de envío configurados por la institución.</p>
        </section>

        <section aria-labelledby="email-title">
          <h2 id="email-title" class="text-xl font-semibold text-[var(--color-text)]">Correos y recuperación de contraseña</h2>
          <p class="mt-2 leading-6">La API de Gmail está contemplada en la configuración para el envío de correos; esta página no afirma que la integración esté actualmente activa en todos los ambientes. El permiso previsto se limita al envío y no incluye la lectura de mensajes ni de la bandeja de entrada.</p>
          <p class="mt-3 leading-6">Los correos pueden contener el destinatario, el nombre si fue utilizado en el mensaje y un enlace con un token de restablecimiento de un solo uso. Las credenciales de Google permanecen en el backend y no se exponen al navegador.</p>
        </section>

        <section aria-labelledby="storage-title">
          <h2 id="storage-title" class="text-xl font-semibold text-[var(--color-text)]">Sesión y seguimiento</h2>
          <p class="mt-2 leading-6">El cliente conserva la sesión en el <code class="rounded bg-[#f4e7e7] px-1.5 py-0.5 text-sm text-[var(--color-brand)]">sessionStorage</code> del navegador. En esta incorporación no se agregan herramientas de seguimiento ni cookies nuevas.</p>
        </section>

        <section aria-labelledby="contact-title">
          <h2 id="contact-title" class="text-xl font-semibold text-[var(--color-text)]">Consultas y revisión</h2>
          <p class="mt-2 leading-6">Las consultas sobre la información personal pueden canalizarse por las vías habituales de contacto administrativo de la institución. No se indica aquí una dirección de correo, domicilio, plazo de conservación o procedimiento de eliminación porque esos datos deben ser confirmados institucionalmente.</p>
        </section>
      </div>

      <footer class="mt-9 border-t border-[var(--color-border)] pt-5 text-sm leading-6 text-[var(--color-graphite)]">
        Volvé a la <RouterLink :to="{ name: 'presentation' }" class="font-semibold text-[var(--color-brand)] underline">presentación del instituto</RouterLink> o <RouterLink :to="{ name: 'login' }" class="font-semibold text-[var(--color-brand)] underline">ingresá a la intranet</RouterLink>.
      </footer>
    </article>
  </AuthLayout>
</template>

<script setup lang="ts">
import AuthLayout from '@/layouts/AuthLayout.vue'
</script>
