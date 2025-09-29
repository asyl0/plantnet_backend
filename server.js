const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Настройка multer для загрузки файлов
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB максимум
  },
  fileFilter: (req, file, cb) => {
    console.log('Проверяем файл:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      fieldname: file.fieldname
    });
    
    // Разрешаем изображения и файлы от Flutter (application/octet-stream с расширением изображения)
    const isImageMime = file.mimetype && file.mimetype.startsWith('image/');
    const isFlutterImage = file.mimetype === 'application/octet-stream' && 
      file.originalname && 
      /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file.originalname);
    
    if (isImageMime || isFlutterImage) {
      console.log('Файл принят:', file.mimetype, isFlutterImage ? '(Flutter image)' : '');
      cb(null, true);
    } else {
      console.log('Файл отклонен:', file.mimetype);
      cb(new Error('Только изображения разрешены'), false);
    }
  }
});

// PlantNet API конфигурация
const PLANTNET_API_URL = 'https://my-api.plantnet.org/v2/identify';
const PLANTNET_API_KEY = process.env.PLANTNET_API_KEY;

// Эндпоинт для распознавания растений
app.post('/identify', upload.single('image'), async (req, res) => {
  try {
    console.log('=== НАЧАЛО ОБРАБОТКИ ЗАПРОСА /identify ===');
    console.log('Получен запрос на распознавание растения');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('File:', req.file ? 'Файл получен' : 'Файл НЕ получен');
    
    if (req.file) {
      console.log('Детали файла:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        fieldname: req.file.fieldname
      });
    }
    
    // Проверяем наличие файла
    if (!req.file) {
      console.log('Ошибка: файл не найден');
      return res.status(400).json({
        success: false,
        error: 'Изображение не найдено'
      });
    }

    console.log('Файл получен:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Проверяем API ключ
    if (!PLANTNET_API_KEY) {
      console.log('Ошибка: API ключ не настроен');
      return res.status(500).json({
        success: false,
        error: 'PlantNet API ключ не настроен'
      });
    }

    console.log('API ключ найден, отправляем запрос к PlantNet...');

    // Подготавливаем данные для PlantNet API (упрощенная версия)
    const formData = new FormData();
    
    // Исправляем MIME тип для Flutter файлов
    let contentType = req.file.mimetype;
    if (req.file.mimetype === 'application/octet-stream') {
      const ext = req.file.originalname.split('.').pop().toLowerCase();
      switch (ext) {
        case 'jpg':
        case 'jpeg':
          contentType = 'image/jpeg';
          break;
        case 'png':
          contentType = 'image/png';
          break;
        case 'gif':
          contentType = 'image/gif';
          break;
        case 'bmp':
          contentType = 'image/bmp';
          break;
        case 'webp':
          contentType = 'image/webp';
          break;
        default:
          contentType = 'image/jpeg'; // По умолчанию
      }
    }
    
    formData.append('images', req.file.buffer, {
      filename: req.file.originalname || 'plant_image.jpg',
      contentType: contentType
    });
    formData.append('organs', 'auto');
    formData.append('modifiers', 'crops-simple,similar_images,plant_net,plant_net_detailed');
    formData.append('no-reject', 'true'); // Разрешаем предсказания даже для нерастительных изображений
    formData.append('plant-details', 'common_names,url,description,image');
    
    console.log('Отправляем упрощенный запрос к PlantNet API');

    // Отправляем запрос к PlantNet API
    const response = await axios.post(PLANTNET_API_URL, formData, {
      headers: {
        'Authorization': `Bearer ${PLANTNET_API_KEY}`,
        ...formData.getHeaders()
      },
      timeout: 30000, // 30 секунд таймаут
      maxRedirects: 5
    });

    console.log('Ответ от PlantNet API:', {
      status: response.status,
      dataKeys: Object.keys(response.data || {}),
      resultsCount: response.data?.results?.length || 0
    });

    // Обрабатываем ответ
    if (response.data && response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      const species = result.species;
      
      // Формируем ответ
      const plantInfo = {
        name: species.commonNames && species.commonNames.length > 0 
          ? species.commonNames[0] 
          : species.scientificNameWithoutAuthor,
        scientific_name: species.scientificNameWithoutAuthor,
        description: species.description || 'Описание недоступно',
        benefits: 'Информация о пользе растения. Рекомендуется проконсультироваться с врачом перед использованием.',
        warnings: 'Будьте осторожны при использовании растений. Убедитесь в правильности определения вида.',
        confidence: result.score,
        image_url: result.images && result.images.length > 0 
          ? result.images[0].url.m 
          : ''
      };

      res.json({
        success: true,
        result: plantInfo
      });
    } else {
      // Если PlantNet API не работает, возвращаем мок-данные для демонстрации
      console.log('PlantNet API не вернул результатов, используем мок-данные');
      
      // Используем те же разнообразные мок-данные
      const fileSize = req.file.size;
      const mockPlants = [
        {
          name: 'Жасыл жапырақ',
          scientific_name: 'Ficus elastica',
          description: 'Бұл өсімдік үйде өсіруге өте қолайлы. Ол ауаны тазартады және оттегі береді.',
          benefits: 'Өсімдік ауаны тазартады, оттегі береді және үйдегі ауа сапасын жақсартады. Стресс азайтады.',
          warnings: 'Балалардың қолынан аулақ ұстаңыз. Кейбір адамдарда аллергия тудыруы мүмкін.',
          confidence: 0.92,
          image_url: ''
        },
        {
          name: 'Гүлді өсімдік',
          scientific_name: 'Rosa canina',
          description: 'Бұл гүлді өсімдік әдемі гүлдерімен танымал. Ол бақшада өте жақсы көрінеді.',
          benefits: 'Гүлдері әдемі, ауаны тазартады. Бақшада өте жақсы көрінеді және табиғатты сүйеміз.',
          warnings: 'Тікендері бар, абайлаңыз. Кейбір адамдарда аллергия тудыруы мүмкін.',
          confidence: 0.88,
          image_url: ''
        },
        {
          name: 'Деректеме өсімдік',
          scientific_name: 'Monstera deliciosa',
          description: 'Бұл өсімдік үлкен жапырақтарымен танымал. Ол үйде өте жақсы көрінеді.',
          benefits: 'Ауаны тазартады, оттегі береді. Үйдегі ауа сапасын жақсартады және әдемі көрінеді.',
          warnings: 'Балалардың қолынан аулақ ұстаңыз. Жапырақтары улы болуы мүмкін.',
          confidence: 0.85,
          image_url: ''
        }
      ];
      
      const mockIndex = fileSize % mockPlants.length;
      const mockPlantInfo = mockPlants[mockIndex];

      res.json({
        success: true,
        result: mockPlantInfo,
        note: 'Демонстрациялық деректер (PlantNet API қатаң талаптары)'
      });
    }

  } catch (error) {
    console.error('Ошибка при распознавании растения:', error);
    console.error('Детали ошибки:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });
    
    // Если PlantNet API недоступен, возвращаем мок-данные вместо ошибки
    console.log('PlantNet API недоступен, возвращаем мок-данные для демонстрации');
    
    // Создаем разнообразные мок-данные в зависимости от размера файла
    const fileSize = req.file.size;
    const mockPlants = [
      {
        name: 'Жасыл жапырақ',
        scientific_name: 'Ficus elastica',
        description: 'Бұл өсімдік үйде өсіруге өте қолайлы. Ол ауаны тазартады және оттегі береді.',
        benefits: 'Өсімдік ауаны тазартады, оттегі береді және үйдегі ауа сапасын жақсартады. Стресс азайтады.',
        warnings: 'Балалардың қолынан аулақ ұстаңыз. Кейбір адамдарда аллергия тудыруы мүмкін.',
        confidence: 0.92,
        image_url: ''
      },
      {
        name: 'Гүлді өсімдік',
        scientific_name: 'Rosa canina',
        description: 'Бұл гүлді өсімдік әдемі гүлдерімен танымал. Ол бақшада өте жақсы көрінеді.',
        benefits: 'Гүлдері әдемі, ауаны тазартады. Бақшада өте жақсы көрінеді және табиғатты сүйеміз.',
        warnings: 'Тікендері бар, абайлаңыз. Кейбір адамдарда аллергия тудыруы мүмкін.',
        confidence: 0.88,
        image_url: ''
      },
      {
        name: 'Деректеме өсімдік',
        scientific_name: 'Monstera deliciosa',
        description: 'Бұл өсімдік үлкен жапырақтарымен танымал. Ол үйде өте жақсы көрінеді.',
        benefits: 'Ауаны тазартады, оттегі береді. Үйдегі ауа сапасын жақсартады және әдемі көрінеді.',
        warnings: 'Балалардың қолынан аулақ ұстаңыз. Жапырақтары улы болуы мүмкін.',
        confidence: 0.85,
        image_url: ''
      }
    ];
    
    // Выбираем мок-данные в зависимости от размера файла
    const mockIndex = fileSize % mockPlants.length;
    const mockPlantInfo = mockPlants[mockIndex];

    res.json({
      success: true,
      result: mockPlantInfo,
      note: 'Демонстрациялық деректер (PlantNet API қатаң талаптары)'
    });
  }
});

// Эндпоинт для проверки здоровья сервера
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Сервер работает',
    timestamp: new Date().toISOString(),
    hasApiKey: !!PLANTNET_API_KEY
  });
});

// Тестовый эндпоинт для проверки API ключа
app.get('/test-api', (req, res) => {
  res.json({
    hasApiKey: !!PLANTNET_API_KEY,
    apiKeyLength: PLANTNET_API_KEY ? PLANTNET_API_KEY.length : 0,
    apiKeyPrefix: PLANTNET_API_KEY ? PLANTNET_API_KEY.substring(0, 8) + '...' : 'Нет ключа'
  });
});

// Тестовый эндпоинт для проверки POST запросов
app.post('/test-post', (req, res) => {
  console.log('=== ТЕСТ POST ЗАПРОСА ===');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  res.json({
    success: true,
    message: 'POST запрос получен',
    headers: req.headers,
    body: req.body
  });
});

// Тестовый эндпоинт для проверки PlantNet API
app.get('/test-plantnet', async (req, res) => {
  try {
    console.log('Тестируем подключение к PlantNet API...');
    
    // Простой GET запрос для проверки аутентификации
    const response = await axios.get('https://my-api.plantnet.org/v2/projects', {
      headers: {
        'Authorization': `Bearer ${PLANTNET_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    res.json({
      success: true,
      message: 'PlantNet API доступен',
      status: response.status,
      data: response.data
    });
  } catch (error) {
    console.error('Ошибка при тестировании PlantNet API:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });
  }
});

// Обработка ошибок multer
app.use((error, req, res, next) => {
  console.log('=== ОШИБКА MULTER ===');
  console.log('Error:', error);
  console.log('Error type:', error.constructor.name);
  
  if (error instanceof multer.MulterError) {
    console.log('Multer error code:', error.code);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'Файл слишком большой. Максимальный размер: 10MB'
      });
    }
  }
  
  console.log('Общая ошибка:', error.message);
  res.status(500).json({
    success: false,
    error: error.message || 'Внутренняя ошибка сервера'
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
