import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import alumnoRoutes from './alumnoRoutes.js';
import profesorRoutes from './profesorRoutes.js';
import administrativoRoutes from './administrativoRoutes.js';
import carreraRoutes from './carreraRoutes.js';
import materiaRoutes from './materiaRoutes.js';
import inscripcionCarreraRoutes from './inscripcionCarreraRoutes.js';
import inscripcionMateriaRoutes from './inscripcionMateriaRoutes.js';
import examenRoutes from './examenRoutes.js';
import horarioRoutes from './horarioRoutes.js';
import periodoInscripcionRoutes from './periodoInscripcionRoutes.js';

const router = Router();

// Rutas principales
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

// Rutas específicas por rol
router.use('/alumnos', alumnoRoutes);
router.use('/profesores', profesorRoutes);
router.use('/administrativos', administrativoRoutes);

// Rutas de gestión académica
router.use('/carreras', carreraRoutes);
router.use('/materias', materiaRoutes);

// Rutas de inscripciones
router.use('/inscripciones-carreras', inscripcionCarreraRoutes);
router.use('/inscripciones-materias', inscripcionMateriaRoutes);

// Rutas de exámenes
router.use('/examenes', examenRoutes);

// Rutas de horarios
router.use('/horarios', horarioRoutes);

// Rutas de períodos de inscripción
router.use('/periodos-inscripcion', periodoInscripcionRoutes);

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

router.get('/', (req, res) => {
  res.json({
    message: 'API Instituto Académico',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      alumnos: '/api/alumnos',
      profesores: '/api/profesores',
      administrativos: '/api/administrativos',
      carreras: '/api/carreras',
      materias: '/api/materias',
      inscripcionesCarreras: '/api/inscripciones-carreras',
      inscripcionesMaterias: '/api/inscripciones-materias',
      examenes: '/api/examenes',
      horarios: '/api/horarios',
      periodosInscripcion: '/api/periodos-inscripcion',
      health: '/api/health'
    }
  });
});

export default router;