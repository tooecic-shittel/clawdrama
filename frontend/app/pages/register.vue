<script setup>
// Register page reuses the login template — identical UI, mode is derived from route.path.
// Importing the actual component avoids duplication.
import LoginPage from './login.vue'

definePageMeta({ layout: false })
</script>

<template>
  <LoginPage />
</template>
