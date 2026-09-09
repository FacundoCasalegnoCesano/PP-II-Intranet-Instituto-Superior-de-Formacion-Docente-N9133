<script setup lang="ts">
import logoUrl from '@/assets/logo-calvario.jpg'
import institutePhotoUrl from '@/assets/calvario-instituto.png'
</script>

<template>
  <main class="min-h-screen bg-[var(--color-background)] lg:grid lg:grid-cols-2">
    <section class="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
      <div class="w-full max-w-md">
        <img :src="logoUrl" alt="Instituto Superior de Formación Docente N.º 9133" class="h-20 w-auto object-contain object-left" />
        <slot />
      </div>
    </section>
    <aside class="relative hidden overflow-hidden lg:block" aria-label="Instituto Superior de Formación Docente N.º 9133">
      <img :src="institutePhotoUrl" alt="Edificio del Instituto Superior de Formación Docente N.º 9133" class="absolute inset-0 h-full w-full object-cover" />
      <div class="absolute inset-0 bg-[#74151a]/35" />
      <p class="absolute bottom-10 left-10 max-w-sm text-3xl font-semibold leading-tight text-white">Una comunidad para aprender, enseñar y acompañar trayectorias.</p>
    </aside>
  </main>
</template>
