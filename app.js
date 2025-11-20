// Debounce 輔助函數
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 資料模型：分類 -> 子分類 -> 變化
// 每個變化都是可點擊加入建構器的元件。

// 資料將從 data.json 異步載入
let DATA = [];

// 異步載入資料
async function loadData() {
  try {
    const response = await fetch('./data.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    DATA = await response.json();
    return true;
  } catch (error) {
    console.error('載入資料失敗:', error);
    // 可以設定一個空的預設資料，避免應用完全崩潰
    DATA = [];
    return false;
  }
}

const els = {
  categoryList: document.getElementById('categoryList'),
  variationGrid: document.getElementById('variationGrid'),
  panelTitle: document.getElementById('panelTitle'),
  subcategoryFilter: document.getElementById('subcategoryFilter'),
  breadcrumbs: document.getElementById('breadcrumbs'),
  selectedList: document.getElementById('selectedList'), // May be null if using modular blocks
  output: document.getElementById('output'),
  copyPrompt: document.getElementById('copyPrompt'),
  clearSelection: document.getElementById('clearSelection'),
  delimiterNewlines: document.getElementById('delimiterNewlines'),
  delimiter: document.getElementById('delimiter'),
  globalSearch: document.getElementById('globalSearch'),
  toast: document.getElementById('toast'),
  promptSuggestions: document.getElementById('promptSuggestions'),
  modularBlocks: document.getElementById('modularBlocks'),
  randomizeBtn: document.getElementById('randomizeBtn')
};

let state = {
  selectedCategoryId: null,
  selectedSubcategoryId: '',
  query: '',
  selected: [], // array of { id, label }
  selectedModel: 'midjourney', // 新增：選中的模型
  promptBlocks: [], // 新增：模組化提示塊 [{ type, value, isLocked }, ...]
  // 所有動態類別的狀態
  dynamicState: {
    // 場景類別的特殊狀態
    scenes: {
      sceneType: null,
      firstModifier: null,
      secondModifier: null
    }
    // 其他類別的狀態會在需要時動態創建
  }
};

const STORAGE_KEY = 'prompt_dictionary_v1';
const SCENE_MODIFIERS_KEY = 'scene_modifiers_v1';
const CUSTOM_VARIATIONS_KEY = 'custom_variations_v1';
const MODEL_STORAGE_KEY = 'selected_model_v1';
const BLOCKS_STORAGE_KEY = 'prompt_blocks_v1';

// 模組類型定義
const BLOCK_TYPES = {
  CHARACTER: 'Character',
  ENVIRONMENT: 'Environment',
  LIGHTING: 'Lighting',
  CAMERA: 'Camera',
  STYLE: 'Style',
  MOOD: 'Mood',
  COMPOSITION: 'Composition'
};

// Autocomplete suggestions for each block type
const BLOCK_SUGGESTIONS = {
  [BLOCK_TYPES.CHARACTER]: [
    '成年男性', '成年女性', '孩童', '年長者',
    '貓咪坐姿', '狗狗奔跑', '馬匹站立',
    '休閒穿搭', '正式服裝', '運動裝束',
    '短髮', '長髮', '捲髮'
  ],
  [BLOCK_TYPES.ENVIRONMENT]: [
    '森林', '沙漠', '海洋', '山脈',
    '家具（椅子、桌子、沙發）', '交通工具（汽車、腳踏車、船）',
    '木質表面', '拉絲金屬', '透明玻璃',
    '全新無瑕', '磨損風化', '破損，邊緣裂痕'
  ],
  [BLOCK_TYPES.LIGHTING]: [
    'Cinematic', 'Soft Light', 'Volumetric', 'Neon',
    '自然陽光', '黃金時刻光線', '藍色時刻光線',
    '柔和漫射光', '戲劇性明暗對比', '逆光剪影',
    '暖色調光線', '冷色調光線', '邊緣光',
    '燭光', '霓虹燈光', '月光'
  ],
  [BLOCK_TYPES.CAMERA]: [
    'Wide Angle', 'Macro', '85mm', 'Drone View',
    '特寫構圖', '中景', '全身構圖',
    '低角度視角', '高角度視角', '視線水平視角',
    '側面視角', '俯視', '仰視'
  ],
  [BLOCK_TYPES.STYLE]: [
    '寧靜平和的氛圍', '動態有活力的氛圍', '陰暗神祕的氣息',
    '夢幻迷離', '電影感', '賽博龐克',
    '極簡風格', '復古風格', '未來主義'
  ],
  [BLOCK_TYPES.MOOD]: [
    '歡樂愉悅', '憂鬱感傷', '平和寧靜',
    '戲劇張力', '神秘氛圍', '浪漫情調',
    '懷舊感', '活力四射', '陰鬱沉重',
    '充滿希望', '緊張不安', '恬靜祥和'
  ],
  [BLOCK_TYPES.COMPOSITION]: [
    '對稱構圖', '三分法則', '中心構圖',
    '引導線構圖', '框架構圖', '負空間構圖',
    '動態構圖', '靜態構圖'
  ]
};

// 默認修飾詞
const DEFAULT_MODIFIERS = {
  firstModifiers: ['史前', '原始', '魔法'],
  secondModifiers: ['佈滿苔蘚的', '百花齊放的']
};

// 獲取用戶自定義的修飾詞或使用默認值
function getSceneModifiers() {
  try {
    const saved = localStorage.getItem(SCENE_MODIFIERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        firstModifiers: parsed.firstModifiers && parsed.firstModifiers.length > 0 
          ? parsed.firstModifiers 
          : DEFAULT_MODIFIERS.firstModifiers,
        secondModifiers: parsed.secondModifiers && parsed.secondModifiers.length > 0
          ? parsed.secondModifiers
          : DEFAULT_MODIFIERS.secondModifiers
      };
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_MODIFIERS;
}

// 保存用戶自定義的修飾詞
function saveSceneModifiers(modifiers) {
  try {
    localStorage.setItem(SCENE_MODIFIERS_KEY, JSON.stringify(modifiers));
  } catch (e) {
    // ignore
  }
}

// 獲取用戶自定義的選項（所有類別）
function getCustomVariations() {
  try {
    const saved = localStorage.getItem(CUSTOM_VARIATIONS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    // ignore
  }
  return {};
}

// 保存用戶自定義的選項
function saveCustomVariations(customVariations) {
  try {
    localStorage.setItem(CUSTOM_VARIATIONS_KEY, JSON.stringify(customVariations));
  } catch (e) {
    // ignore
  }
}

// 獲取類別的選項（優先使用用戶自定義的）
function getCategoryVariations(categoryId) {
  const cat = DATA.find(c => c.id === categoryId);
  if (!cat) return null;
  
  const customVariations = getCustomVariations();
  const custom = customVariations[categoryId];
  
  if (custom && custom.subcategories && custom.subcategories.length > 0) {
    return custom;
  }
  
  return cat;
}

// ---------- Model Selector Functions ----------
function initModelSelector() {
  const modelButtons = document.querySelectorAll('.model-btn');
  modelButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const model = btn.dataset.model;
      state.selectedModel = model;
      
      // Update active state
      modelButtons.forEach(b => {
        b.removeAttribute('data-active');
        b.classList.remove('active');
      });
      btn.setAttribute('data-active', 'true');
      btn.classList.add('active');
      
      // Save to localStorage
      try {
        localStorage.setItem(MODEL_STORAGE_KEY, model);
      } catch (e) {
        // ignore
      }
      
      // Re-render blocks if needed
      renderModularBlocks();
      updateOutput();
      showToast(`已切換到 ${btn.textContent} 模式`);
    });
  });
  
  // Restore saved model
  try {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    if (saved) {
      state.selectedModel = saved;
      const btn = document.querySelector(`.model-btn[data-model="${saved}"]`);
      if (btn) {
        btn.setAttribute('data-active', 'true');
        btn.classList.add('active');
      }
    }
  } catch (e) {
    // ignore
  }
}

// ---------- Modular Blocks System ----------
function initializeBlocks() {
  // Initialize default blocks if empty
  if (state.promptBlocks.length === 0) {
    state.promptBlocks = [
      { type: BLOCK_TYPES.CHARACTER, value: '', isLocked: false },
      { type: BLOCK_TYPES.ENVIRONMENT, value: '', isLocked: false },
      { type: BLOCK_TYPES.LIGHTING, value: '', isLocked: false },
      { type: BLOCK_TYPES.CAMERA, value: '', isLocked: false },
      { type: BLOCK_TYPES.STYLE, value: '', isLocked: false }
    ];
  }
  renderModularBlocks();
}

function renderModularBlocks() {
  if (!els.modularBlocks) return;
  
  els.modularBlocks.innerHTML = '';
  
  state.promptBlocks.forEach((block, index) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'modular-block';
    blockEl.dataset.index = index;
    
    const lockIcon = block.isLocked ? '🔒' : '🔓';
    blockEl.innerHTML = `
      <div class="block-header">
        <div class="block-title">
          <span class="block-type">${block.type}</span>
          <button class="block-lock-btn" data-index="${index}" title="${block.isLocked ? '解鎖' : '鎖定'}">
            ${lockIcon}
          </button>
        </div>
      </div>
      <div class="block-content">
        <div class="block-input-wrapper">
          <input 
            type="text" 
            class="block-input" 
            data-index="${index}"
            data-block-type="${block.type}"
            value="${block.value}"
            placeholder="輸入 ${block.type} 描述..."
            ${block.isLocked ? 'readonly' : ''}
            autocomplete="off"
          />
          <div class="block-autocomplete" data-index="${index}" hidden></div>
        </div>
      </div>
    `;
    
    // Lock toggle
    const lockBtn = blockEl.querySelector('.block-lock-btn');
    lockBtn.addEventListener('click', () => toggleBlockLock(index));
    
    // Input change and autocomplete
    const input = blockEl.querySelector('.block-input');
    const autocompleteEl = blockEl.querySelector('.block-autocomplete');
    
    if (!block.isLocked) {
      input.addEventListener('input', (e) => {
        updateBlockValue(index, e.target.value);
        showAutocomplete(index, e.target.value, block.type);
      });
      
      input.addEventListener('focus', (e) => {
        if (e.target.value) {
          showAutocomplete(index, e.target.value, block.type);
        }
      });
      
      input.addEventListener('blur', () => {
        // Delay to allow click on suggestion
        setTimeout(() => {
          hideAutocomplete(index);
        }, 200);
      });
    }
    
    els.modularBlocks.appendChild(blockEl);
  });
  
  updateOutput();
}

function showAutocomplete(blockIndex, value, blockType) {
  const autocompleteEl = document.querySelector(`.block-autocomplete[data-index="${blockIndex}"]`);
  if (!autocompleteEl) return;
  
  const suggestions = BLOCK_SUGGESTIONS[blockType] || [];
  const query = value.trim().toLowerCase();
  
  if (!query || suggestions.length === 0) {
    hideAutocomplete(blockIndex);
    return;
  }
  
  // Filter suggestions
  const filtered = suggestions.filter(s => 
    s.toLowerCase().includes(query) && s.toLowerCase() !== query
  ).slice(0, 5); // Show max 5 suggestions
  
  if (filtered.length === 0) {
    hideAutocomplete(blockIndex);
    return;
  }
  
  autocompleteEl.innerHTML = '';
  filtered.forEach(suggestion => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.textContent = suggestion;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent input blur
      selectAutocompleteSuggestion(blockIndex, suggestion);
    });
    autocompleteEl.appendChild(item);
  });
  
  autocompleteEl.hidden = false;
}

function hideAutocomplete(blockIndex) {
  const autocompleteEl = document.querySelector(`.block-autocomplete[data-index="${blockIndex}"]`);
  if (autocompleteEl) {
    autocompleteEl.hidden = true;
  }
}

function selectAutocompleteSuggestion(blockIndex, suggestion) {
  if (state.promptBlocks[blockIndex]) {
    state.promptBlocks[blockIndex].value = suggestion;
    renderModularBlocks();
    saveBlocksState();
  }
}

function toggleBlockLock(index) {
  if (state.promptBlocks[index]) {
    state.promptBlocks[index].isLocked = !state.promptBlocks[index].isLocked;
    renderModularBlocks();
    saveBlocksState();
  }
}

function updateBlockValue(index, value) {
  if (state.promptBlocks[index]) {
    state.promptBlocks[index].value = value;
    updateOutput();
    saveBlocksState();
  }
}

function randomizeUnlockedBlocks() {
  const unlockedBlocks = state.promptBlocks.filter(b => !b.isLocked);
  
  if (unlockedBlocks.length === 0) {
    showToast('所有模組都已鎖定');
    return;
  }
  
  // Get random suggestions from categories
  unlockedBlocks.forEach(block => {
    const suggestions = getRandomSuggestionsForBlock(block.type);
    if (suggestions.length > 0) {
      block.value = suggestions[Math.floor(Math.random() * suggestions.length)];
    }
  });
  
  renderModularBlocks();
  showToast(`已隨機化 ${unlockedBlocks.length} 個模組`);
}

function getRandomSuggestionsForBlock(blockType) {
  const suggestions = [];
  
  // Map block types to categories
  const categoryMap = {
    [BLOCK_TYPES.CHARACTER]: ['humans', 'animals'],
    [BLOCK_TYPES.ENVIRONMENT]: ['scenes', 'objects'],
    [BLOCK_TYPES.LIGHTING]: ['lighting-mood'],
    [BLOCK_TYPES.CAMERA]: ['camera-angles'],
    [BLOCK_TYPES.STYLE]: ['styles'],
    [BLOCK_TYPES.MOOD]: ['lighting-mood'],
    [BLOCK_TYPES.COMPOSITION]: ['camera-angles']
  };
  
  const categoryIds = categoryMap[blockType] || [];
  
  categoryIds.forEach(catId => {
    const cat = DATA.find(c => c.id === catId);
    if (cat && cat.subcategories) {
      cat.subcategories.forEach(sub => {
        if (sub.variations) {
          sub.variations.forEach(v => {
            suggestions.push(v.label);
          });
        }
      });
    }
  });
  
  return suggestions;
}

function saveBlocksState() {
  try {
    localStorage.setItem(BLOCKS_STORAGE_KEY, JSON.stringify(state.promptBlocks));
  } catch (e) {
    // ignore
  }
}

function loadBlocksState() {
  try {
    const saved = localStorage.getItem(BLOCKS_STORAGE_KEY);
    if (saved) {
      state.promptBlocks = JSON.parse(saved);
    }
  } catch (e) {
    // ignore
  }
}


function saveState() {
  const toSave = {
    selectedCategoryId: state.selectedCategoryId,
    selectedSubcategoryId: state.selectedSubcategoryId,
    selected: state.selected,
    delimiterNewlines: els.delimiterNewlines ? els.delimiterNewlines.checked : false,
    delimiter: els.delimiter ? els.delimiter.value : ', ',
    dynamicState: state.dynamicState,
    outputText: els.output.value, // 保存用戶編輯的內容
    selectedModel: state.selectedModel,
    promptBlocks: state.promptBlocks
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    // ignore storage errors
  }
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.selectedCategoryId) state.selectedCategoryId = parsed.selectedCategoryId;
    if (typeof parsed.selectedSubcategoryId === 'string') state.selectedSubcategoryId = parsed.selectedSubcategoryId;
    if (Array.isArray(parsed.selected)) state.selected = parsed.selected;
    // These elements may not exist if using modular blocks
    if (typeof parsed.delimiterNewlines === 'boolean' && els.delimiterNewlines) {
      els.delimiterNewlines.checked = parsed.delimiterNewlines;
    }
    if (typeof parsed.delimiter === 'string' && els.delimiter) {
      els.delimiter.value = parsed.delimiter;
    }
    if (parsed.dynamicState && typeof parsed.dynamicState === 'object') {
      state.dynamicState = { ...state.dynamicState, ...parsed.dynamicState };
    }
    if (parsed.selectedModel) state.selectedModel = parsed.selectedModel;
    if (Array.isArray(parsed.promptBlocks)) state.promptBlocks = parsed.promptBlocks;
    // 恢復用戶編輯的內容
    if (typeof parsed.outputText === 'string') {
      els.output.value = parsed.outputText;
    }
  } catch (e) {
    // ignore
  }
  
  // Load blocks state separately
  loadBlocksState();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 1400);
}

function renderCategories() {
  if (!els.categoryList) return;
  
  // Verify state - log the search term
  const searchTerm = state.query || '';
  console.log('Search term:', searchTerm);
  console.log('State query:', state.query);
  
  // Clear the list first
  els.categoryList.innerHTML = '';
  
  // Create filter logic - derive filteredCategories BEFORE rendering
  const searchTermLower = searchTerm.trim().toLowerCase();
  
  const filteredCategories = DATA.filter(category => {
    // If no search term, show all categories
    if (!searchTermLower) {
      return true;
    }
    
    // Match category name
    const categoryNameMatch = category.name.toLowerCase().includes(searchTermLower);
    if (categoryNameMatch) return true;
    
    // Deep search: Check subcategory names
    if (category.subcategories && Array.isArray(category.subcategories)) {
      const subcategoryMatch = category.subcategories.some(sub => {
        if (!sub || !sub.name) return false;
        return sub.name.toLowerCase().includes(searchTermLower);
      });
      if (subcategoryMatch) return true;
      
      // Deep search: Check variation labels within subcategories
      const variationMatch = category.subcategories.some(sub => {
        if (!sub || !sub.variations || !Array.isArray(sub.variations)) return false;
        return sub.variations.some(variation => {
          if (!variation || !variation.label) return false;
          return variation.label.toLowerCase().includes(searchTermLower);
        });
      });
      if (variationMatch) return true;
    }
    
    // Check sceneTypes for dynamic categories
    if (category.sceneTypes && Array.isArray(category.sceneTypes)) {
      const sceneTypeMatch = category.sceneTypes.some(sceneType => {
        if (!sceneType) return false;
        return sceneType.toLowerCase().includes(searchTermLower);
      });
      if (sceneTypeMatch) return true;
    }
    
    return false;
  });
  
  console.log(`Filtered ${filteredCategories.length} categories from ${DATA.length} total`);
  
  // Update render: iterate over filteredCategories instead of original DATA
  filteredCategories.forEach(cat => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cat' + (state.selectedCategoryId === cat.id ? ' active' : '');
    el.setAttribute('data-id', cat.id);
    const count = cat.isDynamic 
      ? (cat.sceneTypes?.length || cat.subcategories?.length || 0)
      : cat.subcategories.reduce((n, s) => n + s.variations.length, 0);
    el.innerHTML = `
      <span class="icon">${cat.icon}</span>
      <span class="name">${cat.name}</span>
      <span class="meta">${count}</span>
    `;
    el.addEventListener('click', () => {
      state.selectedCategoryId = cat.id;
      state.selectedSubcategoryId = '';
      // 重置動態類別狀態
      if (cat.isDynamic) {
        resetCategoryState(cat.id);
      } else {
        // 如果切換到非動態類別，關閉管理面板
        if (modifierManagerVisible) {
          modifierManagerVisible = false;
          hideModifierManager();
        }
      }
      
      // 關閉通用管理面板
      if (variationManagerVisible) {
        variationManagerVisible = false;
        hideVariationManager();
      }
      renderAll();
      saveState();
    });
    els.categoryList.appendChild(el);
  });
}

function getActiveCategory() {
  const catId = state.selectedCategoryId || DATA[0]?.id;
  // 使用 getCategoryVariations 以支持自定義選項
  return getCategoryVariations(catId) || DATA.find(c => c.id === catId) || DATA[0];
}

function isDynamicCategory() {
  const cat = getActiveCategory();
  return cat && cat.isDynamic === true;
}

function isSceneCategory() {
  const cat = getActiveCategory();
  return cat && cat.id === 'scenes';
}

// 獲取類別的動態狀態
function getCategoryState(categoryId) {
  if (!state.dynamicState[categoryId]) {
    state.dynamicState[categoryId] = {
      firstModifier: null,
      secondModifier: null
    };
  }
  return state.dynamicState[categoryId];
}

// 重置類別的動態狀態
function resetCategoryState(categoryId) {
  if (categoryId === 'scenes') {
    state.dynamicState.scenes = {
      sceneType: null,
      firstModifier: null,
      secondModifier: null
    };
  } else {
    state.dynamicState[categoryId] = {
      firstModifier: null,
      secondModifier: null
    };
  }
}

// 通用的動態生成函數（適用於所有類別）
function getDynamicVariations() {
  const cat = getActiveCategory();
  if (!isDynamicCategory()) return [];
  
  const categoryId = cat.id;
  
  // 場景類別使用特殊邏輯
  if (isSceneCategory()) {
    return getSceneVariations();
  }
  
  // 其他類別使用通用邏輯
  const catState = getCategoryState(categoryId);
  const { firstModifier, secondModifier } = catState;
  
  // 第一層：顯示子分類（第一層修飾詞）
  if (!firstModifier) {
    const firstLayerOptions = cat.subcategories.map(sub => ({
      id: `first-${categoryId}-${sub.id}`,
      label: sub.name,
      isClickable: true,
      level: 1,
      data: { subcategoryId: sub.id, subcategoryName: sub.name }
    }));
    
    // 添加管理選項
    firstLayerOptions.push({
      id: `manage-${categoryId}`,
      label: '管理選項',
      isClickable: true,
      level: 1,
      isManageOption: true,
      data: {}
    });
    
    return firstLayerOptions;
  }
  
  // 第二層：顯示variations（第二層修飾詞）
  if (!secondModifier) {
    const selectedSub = cat.subcategories.find(s => s.id === firstModifier);
    if (!selectedSub) return [];
    
    const secondLayerOptions = selectedSub.variations.map(variation => ({
      id: variation.id,
      label: variation.label,
      isClickable: false, // 第二層可直接選擇
      level: 2,
      data: { 
        subcategoryId: firstModifier, 
        subcategoryName: selectedSub.name,
        variationId: variation.id,
        variationLabel: variation.label
      }
    }));
    
    return secondLayerOptions;
  }
  
  return [];
}

function getSceneVariations() {
  const cat = getActiveCategory();
  if (!isSceneCategory()) return [];
  
  const modifiers = getSceneModifiers();
  const sceneState = state.dynamicState.scenes || { sceneType: null, firstModifier: null, secondModifier: null };
  const { sceneType, firstModifier, secondModifier } = sceneState;
  
  // 第一層：顯示場景類型
  if (!sceneType) {
    const sceneTypeOptions = cat.sceneTypes.map(type => ({
      id: `scene-type-${type}`,
      label: type,
      isClickable: true,
      level: 1,
      data: { type }
    }));
    
    // 在最後添加「管理修飾詞」選項
    sceneTypeOptions.push({
      id: 'scene-manage-modifiers',
      label: '管理修飾詞',
      isClickable: true,
      level: 1,
      isManageOption: true,
      data: {}
    });
    
    return sceneTypeOptions;
  }
  
  // 第二層：顯示第一層修飾詞 + 場景類型
  if (!firstModifier) {
    return modifiers.firstModifiers.map(modifier => ({
      id: `scene-first-${sceneType}-${modifier}`,
      label: `${modifier}${sceneType}`,
      isClickable: true,
      level: 2,
      data: { type: sceneType, modifier }
    }));
  }
  
  // 第三層：顯示第二層修飾詞 + 第一層選擇
  if (!secondModifier) {
    const firstLabel = `${firstModifier}${sceneType}`;
    return modifiers.secondModifiers.map(modifier => ({
      id: `scene-final-${sceneType}-${firstModifier}-${modifier}`,
      label: `${modifier}${firstLabel}`,
      isClickable: false, // 第三層選項可直接選擇加入建構器
      level: 3,
      data: { type: sceneType, firstModifier, modifier }
    }));
  }
  
  // 不應該到達這裡，因為選擇第三層後應該重置
  return [];
}

function renderBreadcrumbs() {
  const cat = getActiveCategory();
  if (isDynamicCategory()) {
    let path = `首頁 ▸ <span>${cat.name}</span>`;
    
    if (isSceneCategory()) {
      const sceneState = state.dynamicState.scenes || { sceneType: null, firstModifier: null, secondModifier: null };
      const { sceneType, firstModifier, secondModifier } = sceneState;
      if (sceneType) {
        path += ` ▸ <span>${sceneType}</span>`;
        if (firstModifier) {
          path += ` ▸ <span>${firstModifier}${sceneType}</span>`;
          if (secondModifier) {
            path += ` ▸ <span>${secondModifier}${firstModifier}${sceneType}</span>`;
          }
        }
      }
    } else {
      const catState = getCategoryState(cat.id);
      const { firstModifier, secondModifier } = catState;
      if (firstModifier) {
        const selectedSub = cat.subcategories.find(s => s.id === firstModifier);
        if (selectedSub) {
          path += ` ▸ <span>${selectedSub.name}</span>`;
          if (secondModifier) {
            const selectedVar = selectedSub.variations.find(v => v.id === secondModifier);
            if (selectedVar) {
              path += ` ▸ <span>${selectedVar.label}</span>`;
            }
          }
        }
      }
    }
    
    els.breadcrumbs.innerHTML = path;
  } else {
  const sub = (cat.subcategories || []).find(s => s.id === state.selectedSubcategoryId);
  els.breadcrumbs.innerHTML = `首頁 ▸ <span>${cat.name}</span>${sub ? ` ▸ <span>${sub.name}</span>` : ''}`;
  }
}

function renderSubcategoryFilter() {
  const cat = getActiveCategory();
  if (isDynamicCategory()) {
    // 動態類別不顯示子分類篩選器
    els.subcategoryFilter.innerHTML = '<option value="">所有子分類</option>';
  } else {
    // 清空容器
    els.subcategoryFilter.innerHTML = '';
    const select = document.createElement('select');
    select.setAttribute('aria-label', '子分類篩選');
    select.innerHTML = [`<option value="">所有子分類</option>`]
      .concat(cat.subcategories.map(s => `<option value="${s.id}" ${state.selectedSubcategoryId === s.id ? 'selected' : ''}>${s.name}</option>`))
      .join('');
    select.addEventListener('change', (e) => {
      state.selectedSubcategoryId = e.target.value;
      renderBreadcrumbs();
      renderVariations();
      saveState();
    });
    els.subcategoryFilter.appendChild(select);
  }
}

function renderVariations() {
  const cat = getActiveCategory();
  
  // 所有動態類別使用統一的處理邏輯
  if (isDynamicCategory()) {
    const variations = getDynamicVariations();
    const q = state.query.trim().toLowerCase();
    const filtered = variations.filter(v => !q || v.label.toLowerCase().includes(q));
    
    // 過濾掉管理選項以計算數量
    const countVariations = filtered.filter(v => !v.isManageOption).length;
    els.panelTitle.textContent = `變化（${countVariations}）`;
    
    els.variationGrid.innerHTML = '';
    filtered.forEach(v => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      
      if (v.isClickable) {
        // 可點擊的卡片（用於導航）
        if (v.isManageOption) {
          card.className = 'card card-manage';
          card.innerHTML = `
            <h3>${v.label}</h3>
            <div class="tags">
              <span class="tag">⚙️ 設置</span>
            </div>
          `;
          card.addEventListener('click', () => {
            if (isSceneCategory()) {
              toggleModifierManager();
            } else {
              toggleVariationManager(cat.id);
            }
          });
        } else {
          card.innerHTML = `
            <h3>${v.label}</h3>
            <div class="tags">
              <span class="tag">點擊進入</span>
            </div>
          `;
          card.addEventListener('click', () => handleDynamicClick(v));
        }
      } else {
        // 最終選項（可選擇加入建構器）
        const active = state.selected.some(s => s.id === v.id);
        card.className = 'card' + (active ? ' active' : '');
        const categoryName = cat.name;
        card.innerHTML = `
          <h3>${v.label}</h3>
          <div class="tags">
            <span class="tag">${categoryName}</span>
          </div>
        `;
        card.addEventListener('click', () => toggleSelect(v));
      }
      
      els.variationGrid.appendChild(card);
    });
    return;
  }
  
  // 非動態類別的原有邏輯（目前應該沒有）
  const subId = state.selectedSubcategoryId;
  const q = state.query.trim().toLowerCase();
  const all = (subId ? cat.subcategories.filter(s => s.id === subId) : cat.subcategories)
    .flatMap(s => s.variations.map(v => ({ ...v, subcategoryName: s.name, subcategoryId: s.id })));

  const filtered = all.filter(v => !q || v.label.toLowerCase().includes(q) || (v.subcategoryName && v.subcategoryName.toLowerCase().includes(q)));

  els.panelTitle.textContent = `變化（${filtered.length}）`;

  els.variationGrid.innerHTML = '';
  filtered.forEach(v => {
    const active = state.selected.some(s => s.id === v.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card' + (active ? ' active' : '');
    card.innerHTML = `
      <h3>${v.label}</h3>
      <div class="tags">
        <span class="tag">${v.subcategoryName}</span>
      </div>
    `;
    card.addEventListener('click', () => toggleSelect(v));
    els.variationGrid.appendChild(card);
  });
}

function handleDynamicClick(variation) {
  const { data, level } = variation;
  const cat = getActiveCategory();
  const categoryId = cat.id;
  
  if (isSceneCategory()) {
    handleSceneClick(variation);
    return;
  }
  
  // 其他動態類別的處理
  const catState = getCategoryState(categoryId);
  
  if (level === 1) {
    // 選擇第一層修飾詞（子分類）
    catState.firstModifier = data.subcategoryId;
    catState.secondModifier = null;
  }
  
  renderBreadcrumbs();
  renderVariations();
  saveState();
}

function handleSceneClick(variation) {
  const { data, level } = variation;
  
  if (!state.dynamicState.scenes) {
    state.dynamicState.scenes = { sceneType: null, firstModifier: null, secondModifier: null };
  }
  
  if (level === 1) {
    // 選擇場景類型
    state.dynamicState.scenes.sceneType = data.type;
    state.dynamicState.scenes.firstModifier = null;
    state.dynamicState.scenes.secondModifier = null;
  } else if (level === 2) {
    // 選擇第一層修飾詞
    state.dynamicState.scenes.firstModifier = data.modifier;
    state.dynamicState.scenes.secondModifier = null;
  }
  // level === 3 的情況由 toggleSelect 處理，不需要在這裡處理
  
  renderBreadcrumbs();
  renderVariations();
  saveState();
}

function toggleSelect(variation) {
  const exists = state.selected.find(s => s.id === variation.id);
  const cat = getActiveCategory();
  const categoryId = cat.id;
  
  // 如果是場景類別的第三層選項，選擇後重置狀態以便繼續選擇
  if (isSceneCategory() && variation.level === 3) {
    if (!exists) {
      state.selected.push({ id: variation.id, label: variation.label });
      // 重置場景狀態以便繼續選擇其他組合
      if (state.dynamicState.scenes) {
        state.dynamicState.scenes.sceneType = null;
        state.dynamicState.scenes.firstModifier = null;
        state.dynamicState.scenes.secondModifier = null;
      }
    } else {
      state.selected = state.selected.filter(s => s.id !== variation.id);
    }
  } else if (isDynamicCategory() && variation.level === 2) {
    // 其他動態類別的第二層選項，選擇後重置狀態
    if (!exists) {
      state.selected.push({ id: variation.id, label: variation.label });
      // 重置狀態以便繼續選擇其他組合
      const catState = getCategoryState(categoryId);
      catState.firstModifier = null;
      catState.secondModifier = null;
      // 重新渲染以回到第一層
      renderBreadcrumbs();
      renderVariations();
    } else {
      state.selected = state.selected.filter(s => s.id !== variation.id);
    }
  } else {
  if (exists) {
    state.selected = state.selected.filter(s => s.id !== variation.id);
  } else {
    state.selected.push({ id: variation.id, label: variation.label });
  }
  }
  
  renderSelected();
  renderVariations();
  renderBreadcrumbs();
  updateOutput();
  saveState();
}

function removeSelected(id) {
  state.selected = state.selected.filter(s => s.id !== id);
  renderSelected();
  renderVariations();
  updateOutput();
  saveState();
}

function renderSelected() {
  // Safety check: ensure the container element exists
  if (!els.selectedList) {
    console.warn('selectedList element not found in DOM');
    return;
  }
  
  els.selectedList.innerHTML = '';
  state.selected.forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `
      <span>${item.label}</span>
      <button class="remove" title="移除" aria-label="移除">✕</button>
    `;
    chip.querySelector('.remove').addEventListener('click', () => removeSelected(item.id));
    els.selectedList.appendChild(chip);
  });
}

let isUserEditing = false;
let lastSelectedCount = 0;

function updateOutput() {
  // Use modular blocks to generate prompt
  const delimiter = ', ';
  const blocks = state.promptBlocks
    .filter(block => block.value && block.value.trim())
    .map(block => block.value.trim());
  
  const prompt = blocks.join(delimiter);
  els.output.value = prompt;
  
  // Also update based on selected items if they exist (backward compatibility)
  if (state.selected.length > 0 && blocks.length === 0) {
    const parts = state.selected.map(s => s.label);
    const joined = parts.join(delimiter);
    els.output.value = joined;
  }
}

// ---------- AI Prompt Suggestion Engine ----------

// 使用 debounce 創建防抖的建議函數
const debouncedFetchSuggestions = debounce(async (keyword) => {
  await renderPromptSuggestions(keyword);
}, 300);

async function renderPromptSuggestions(query) {
  const el = els.promptSuggestions;
  if (!el) return;
  
  const q = (query || '').trim();
  if (!q) {
    hidePromptSuggestions();
    return;
  }

  // 顯示載入狀態
  el.innerHTML = '<div class="suggestion-item suggestion-loading"><div class="title">載入 AI 建議中...</div></div>';
  el.hidden = false;
  els.globalSearch.setAttribute('aria-expanded', 'true');

  try {
    // 從 Netlify Function 獲取 AI 建議
    const suggestions = await fetchAISuggestions(q);
    
    if (suggestions && suggestions.length > 0) {
      displaySuggestions(suggestions);
    } else {
      hidePromptSuggestions();
    }
  } catch (error) {
    console.error('獲取 AI 建議失敗:', error);
    hidePromptSuggestions();
  }
}

async function fetchAISuggestions(keyword) {
  try {
    const functionUrl = '/.netlify/functions/get-prompt-suggestions';
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyword })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.suggestions && Array.isArray(data.suggestions)) {
      return data.suggestions.map(text => ({
        text: text,
        meta: 'AI 建議'
      }));
    }
    
    return [];
  } catch (error) {
    console.error('獲取 AI 建議時發生錯誤:', error);
    throw error;
  }
}

function displaySuggestions(suggestions) {
  const el = els.promptSuggestions;
  if (!el || suggestions.length === 0) {
    hidePromptSuggestions();
    return;
  }

  el.innerHTML = '';
  suggestions.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    item.innerHTML = `
      <div class="title">${s.text}</div>
      ${s.meta ? `<div class="meta">${s.meta}</div>` : ''}
    `;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applyPromptSuggestion(s.text);
    });
    el.appendChild(item);
  });
  el.hidden = false;
  els.globalSearch.setAttribute('aria-expanded', 'true');
}

function hidePromptSuggestions() {
  const el = els.promptSuggestions;
  if (!el) return;
  el.hidden = true;
  els.globalSearch.setAttribute('aria-expanded', 'false');
}

function applyPromptSuggestion(text) {
  isUserEditing = true;
  els.output.value = text;
  lastSelectedCount = state.selected.length;
  saveState();
  hidePromptSuggestions();
}

function copyToClipboard() {
  const text = els.output.value;
  if (!text) { showToast('沒有可複製的內容'); return; }
  navigator.clipboard.writeText(text)
    .then(() => showToast('已複製提示'))
    .catch(() => {
      // fallback
      els.output.focus();
      els.output.select();
      try {
        const ok = document.execCommand('copy');
        showToast(ok ? '已複製提示' : '複製失敗');
      } catch (_) {
        showToast('複製失敗');
      }
    });
}

function clearSelection() {
  state.selected = [];
  lastSelectedCount = 0;
  // 不清除编辑状态，让用户保留手动编辑的内容
  renderSelected();
  renderVariations();
  // 如果用户没有在编辑，清空输出框
  if (!isUserEditing) {
    els.output.value = '';
  }
  updateOutput();
  saveState();
}

let modifierManagerVisible = false;
let variationManagerVisible = false;
let currentManagingCategoryId = null;

function toggleModifierManager() {
  modifierManagerVisible = !modifierManagerVisible;
  if (modifierManagerVisible) {
    showModifierManager();
  } else {
    hideModifierManager();
  }
}

function showModifierManager() {
  // 創建或顯示管理面板
  let managerPanel = document.getElementById('modifierManagerPanel');
  if (!managerPanel) {
    managerPanel = document.createElement('div');
    managerPanel.id = 'modifierManagerPanel';
    managerPanel.className = 'modifier-manager';
    els.variationGrid.parentElement.appendChild(managerPanel);
  }
  
  const modifiers = getSceneModifiers();
  
  managerPanel.innerHTML = `
    <div class="manager-header">
      <h3>管理修飾詞</h3>
      <button class="btn-close" title="關閉">✕</button>
    </div>
    <div class="manager-content">
      <div class="modifier-section">
        <h4>第一層修飾詞</h4>
        <div id="firstModifiersList" class="modifier-list"></div>
        <div class="modifier-input-group">
          <input type="text" id="firstModifierInput" placeholder="輸入新的第一層修飾詞" maxlength="20">
          <button class="btn btn-primary btn-small" id="addFirstModifier">添加</button>
        </div>
      </div>
      <div class="modifier-section">
        <h4>第二層修飾詞</h4>
        <div id="secondModifiersList" class="modifier-list"></div>
        <div class="modifier-input-group">
          <input type="text" id="secondModifierInput" placeholder="輸入新的第二層修飾詞" maxlength="20">
          <button class="btn btn-primary btn-small" id="addSecondModifier">添加</button>
        </div>
      </div>
      <div class="manager-actions">
        <button class="btn btn-secondary" id="resetModifiers">重置為默認值</button>
      </div>
    </div>
  `;
  
  // 渲染修飾詞列表
  renderModifierList('firstModifiersList', modifiers.firstModifiers, (index) => {
    removeModifier('first', index);
  });
  renderModifierList('secondModifiersList', modifiers.secondModifiers, (index) => {
    removeModifier('second', index);
  });
  
  // 綁定事件
  managerPanel.querySelector('.btn-close').addEventListener('click', () => {
    modifierManagerVisible = false;
    hideModifierManager();
  });
  
  managerPanel.querySelector('#addFirstModifier').addEventListener('click', () => {
    addModifier('first');
  });
  
  managerPanel.querySelector('#addSecondModifier').addEventListener('click', () => {
    addModifier('second');
  });
  
  managerPanel.querySelector('#firstModifierInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addModifier('first');
  });
  
  managerPanel.querySelector('#secondModifierInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addModifier('second');
  });
  
  managerPanel.querySelector('#resetModifiers').addEventListener('click', () => {
    if (confirm('確定要重置為默認值嗎？這將清除所有自定義修飾詞。')) {
      resetModifiers();
    }
  });
  
  managerPanel.style.display = 'block';
}

function hideModifierManager() {
  const managerPanel = document.getElementById('modifierManagerPanel');
  if (managerPanel) {
    managerPanel.style.display = 'none';
  }
}

function renderModifierList(containerId, modifiers, onRemove) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  modifiers.forEach((modifier, index) => {
    const item = document.createElement('div');
    item.className = 'modifier-item';
    item.innerHTML = `
      <span>${modifier}</span>
      <button class="btn-remove" title="刪除">✕</button>
    `;
    item.querySelector('.btn-remove').addEventListener('click', () => onRemove(index));
    container.appendChild(item);
  });
  
  if (modifiers.length === 0) {
    container.innerHTML = '<div class="empty-state">暫無修飾詞</div>';
  }
}

function addModifier(type) {
  const inputId = type === 'first' ? 'firstModifierInput' : 'secondModifierInput';
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  
  if (!value) {
    showToast('請輸入修飾詞');
    return;
  }
  
  const modifiers = getSceneModifiers();
  const modifierList = type === 'first' ? modifiers.firstModifiers : modifiers.secondModifiers;
  
  if (modifierList.includes(value)) {
    showToast('該修飾詞已存在');
    return;
  }
  
  modifierList.push(value);
  saveSceneModifiers(modifiers);
  showToast('已添加修飾詞');
  
  // 更新顯示
  renderModifierList(
    type === 'first' ? 'firstModifiersList' : 'secondModifiersList',
    modifierList,
    (index) => removeModifier(type, index)
  );
  
  input.value = '';
  
  // 如果正在場景類別，重新渲染變化
  if (isSceneCategory()) {
    renderVariations();
  }
}

function removeModifier(type, index) {
  const modifiers = getSceneModifiers();
  const modifierList = type === 'first' ? modifiers.firstModifiers : modifiers.secondModifiers;
  
  if (modifierList.length <= 1) {
    showToast('至少需要保留一個修飾詞');
    return;
  }
  
  modifierList.splice(index, 1);
  saveSceneModifiers(modifiers);
  showToast('已刪除修飾詞');
  
  // 更新顯示
  renderModifierList(
    type === 'first' ? 'firstModifiersList' : 'secondModifiersList',
    modifierList,
    (index) => removeModifier(type, index)
  );
  
  // 如果正在場景類別，重新渲染變化
  if (isSceneCategory()) {
    renderVariations();
  }
}

function resetModifiers() {
  saveSceneModifiers(DEFAULT_MODIFIERS);
  showToast('已重置為默認值');
  
  // 更新顯示
  const modifiers = getSceneModifiers();
  renderModifierList('firstModifiersList', modifiers.firstModifiers, (index) => {
    removeModifier('first', index);
  });
  renderModifierList('secondModifiersList', modifiers.secondModifiers, (index) => {
    removeModifier('second', index);
  });
  
  // 如果正在場景類別，重新渲染變化
  if (isSceneCategory()) {
    renderVariations();
  }
}

function toggleVariationManager(categoryId) {
  currentManagingCategoryId = categoryId;
  variationManagerVisible = !variationManagerVisible;
  if (variationManagerVisible) {
    showVariationManager(categoryId);
  } else {
    hideVariationManager();
  }
}

function showVariationManager(categoryId) {
  let managerPanel = document.getElementById('variationManagerPanel');
  if (!managerPanel) {
    managerPanel = document.createElement('div');
    managerPanel.id = 'variationManagerPanel';
    managerPanel.className = 'modifier-manager';
    els.variationGrid.parentElement.appendChild(managerPanel);
  }
  
  const cat = DATA.find(c => c.id === categoryId);
  const customVariations = getCustomVariations();
  const currentCat = customVariations[categoryId] || cat;
  
  managerPanel.innerHTML = `
    <div class="manager-header">
      <h3>管理選項 - ${cat.name}</h3>
      <button class="btn-close" title="關閉">✕</button>
    </div>
    <div class="manager-content">
      <div id="variationManagerSubcategories" class="variation-manager-subcategories"></div>
      <div class="manager-actions">
        <button class="btn btn-primary btn-small" id="addSubcategory">添加子分類</button>
        <button class="btn btn-secondary btn-small" id="resetCategory">重置為默認值</button>
      </div>
    </div>
  `;
  
  renderSubcategoriesInManager(categoryId, currentCat);
  
  managerPanel.querySelector('.btn-close').addEventListener('click', () => {
    variationManagerVisible = false;
    hideVariationManager();
  });
  
  managerPanel.querySelector('#addSubcategory').addEventListener('click', () => {
    addSubcategory(categoryId);
  });
  
  managerPanel.querySelector('#resetCategory').addEventListener('click', () => {
    if (confirm('確定要重置為默認值嗎？這將清除所有自定義選項。')) {
      resetCategory(categoryId);
    }
  });
  
  managerPanel.style.display = 'block';
}

function hideVariationManager() {
  const managerPanel = document.getElementById('variationManagerPanel');
  if (managerPanel) {
    managerPanel.style.display = 'none';
  }
  currentManagingCategoryId = null;
}

function renderSubcategoriesInManager(categoryId, cat) {
  const container = document.getElementById('variationManagerSubcategories');
  if (!container) return;
  
  container.innerHTML = '';
  
  cat.subcategories.forEach((sub, subIndex) => {
    const subSection = document.createElement('div');
    subSection.className = 'variation-manager-section';
    subSection.innerHTML = `
      <div class="variation-manager-section-header">
        <h4>${sub.name}</h4>
        <button class="btn-remove-small" data-subindex="${subIndex}" title="刪除子分類">✕</button>
      </div>
      <div class="variation-manager-variations" data-subindex="${subIndex}"></div>
      <div class="modifier-input-group">
        <input type="text" class="variation-input" data-subindex="${subIndex}" placeholder="輸入新選項" maxlength="50">
        <button class="btn btn-primary btn-small add-variation-btn" data-subindex="${subIndex}">添加</button>
      </div>
    `;
    
    const variationsContainer = subSection.querySelector('.variation-manager-variations');
    renderVariationsInManager(variationsContainer, sub.variations, subIndex);
    
    subSection.querySelector('.btn-remove-small').addEventListener('click', () => {
      if (cat.subcategories.length <= 1) {
        showToast('至少需要保留一個子分類');
        return;
      }
      removeSubcategory(categoryId, subIndex);
    });
    
    subSection.querySelector('.add-variation-btn').addEventListener('click', () => {
      addVariation(categoryId, subIndex);
    });
    
    subSection.querySelector('.variation-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addVariation(categoryId, subIndex);
    });
    
    container.appendChild(subSection);
  });
}

function renderVariationsInManager(container, variations, subIndex) {
  container.innerHTML = '';
  if (variations.length === 0) {
    container.innerHTML = '<div class="empty-state">暫無選項</div>';
    return;
  }
  
  variations.forEach((variation, varIndex) => {
    const item = document.createElement('div');
    item.className = 'modifier-item';
    item.innerHTML = `
      <span>${variation.label}</span>
      <button class="btn-remove" data-subindex="${subIndex}" data-varindex="${varIndex}" title="刪除">✕</button>
    `;
    item.querySelector('.btn-remove').addEventListener('click', () => {
      removeVariation(currentManagingCategoryId, subIndex, varIndex);
    });
    container.appendChild(item);
  });
}

function addSubcategory(categoryId) {
  const name = prompt('請輸入子分類名稱：');
  if (!name || !name.trim()) return;
  
  const customVariations = getCustomVariations();
  let currentCat = customVariations[categoryId];
  
  if (!currentCat) {
    const originalCat = DATA.find(c => c.id === categoryId);
    currentCat = JSON.parse(JSON.stringify(originalCat)); // 深拷貝
  }
  
  currentCat.subcategories.push({
    id: `sub-${Date.now()}`,
    name: name.trim(),
    variations: []
  });
  
  customVariations[categoryId] = currentCat;
  saveCustomVariations(customVariations);
  showToast('已添加子分類');
  
  renderSubcategoriesInManager(categoryId, currentCat);
  renderVariations();
}

function removeSubcategory(categoryId, subIndex) {
  const customVariations = getCustomVariations();
  const currentCat = customVariations[categoryId] || DATA.find(c => c.id === categoryId);
  
  currentCat.subcategories.splice(subIndex, 1);
  
  const customVariationsObj = getCustomVariations();
  customVariationsObj[categoryId] = currentCat;
  saveCustomVariations(customVariationsObj);
  showToast('已刪除子分類');
  
  renderSubcategoriesInManager(categoryId, currentCat);
  renderVariations();
}

function addVariation(categoryId, subIndex) {
  const container = document.getElementById('variationManagerSubcategories');
  const input = container.querySelector(`.variation-input[data-subindex="${subIndex}"]`);
  const value = input.value.trim();
  
  if (!value) {
    showToast('請輸入選項名稱');
    return;
  }
  
  const customVariations = getCustomVariations();
  let currentCat = customVariations[categoryId];
  
  if (!currentCat) {
    const originalCat = DATA.find(c => c.id === categoryId);
    currentCat = JSON.parse(JSON.stringify(originalCat));
  }
  
  const sub = currentCat.subcategories[subIndex];
  const existing = sub.variations.find(v => v.label === value);
  if (existing) {
    showToast('該選項已存在');
    return;
  }
  
  sub.variations.push({
    id: `var-${categoryId}-${subIndex}-${Date.now()}`,
    label: value
  });
  
  customVariations[categoryId] = currentCat;
  saveCustomVariations(customVariations);
  showToast('已添加選項');
  
  renderSubcategoriesInManager(categoryId, currentCat);
  input.value = '';
  renderVariations();
}

function removeVariation(categoryId, subIndex, varIndex) {
  const customVariations = getCustomVariations();
  let currentCat = customVariations[categoryId];
  
  if (!currentCat) {
    const originalCat = DATA.find(c => c.id === categoryId);
    currentCat = JSON.parse(JSON.stringify(originalCat));
  }
  
  currentCat.subcategories[subIndex].variations.splice(varIndex, 1);
  
  customVariations[categoryId] = currentCat;
  saveCustomVariations(customVariations);
  showToast('已刪除選項');
  
  renderSubcategoriesInManager(categoryId, currentCat);
  renderVariations();
}

function resetCategory(categoryId) {
  const customVariations = getCustomVariations();
  delete customVariations[categoryId];
  saveCustomVariations(customVariations);
  showToast('已重置為默認值');
  
  const cat = DATA.find(c => c.id === categoryId);
  renderSubcategoriesInManager(categoryId, cat);
  renderVariations();
}

function attachEvents() {
  // 注意：subcategoryFilter 的事件處理已經在 renderSubcategoryFilter 中處理
  if (els.copyPrompt) els.copyPrompt.addEventListener('click', copyToClipboard);
  if (els.clearSelection) els.clearSelection.addEventListener('click', clearSelection);
  
  // New modular blocks events
  if (els.randomizeBtn) els.randomizeBtn.addEventListener('click', randomizeUnlockedBlocks);
  
  // These elements may not exist if using modular blocks
  if (els.delimiter) {
    els.delimiter.addEventListener('change', () => { 
      updateOutput();
      saveState(); 
    });
  }
  if (els.delimiterNewlines) {
    els.delimiterNewlines.addEventListener('change', () => { 
      updateOutput();
      saveState(); 
    });
  }
  els.globalSearch.addEventListener('input', (e) => {
    // Update state with search term
    const searchTerm = e.target.value;
    state.query = searchTerm;
    
    // Debug: Verify state update
    console.log('Search input changed:', searchTerm);
    console.log('State updated to:', state.query);
    
    // Immediately update categories and variations
    renderCategories(); // Update categories based on search
    renderVariations(); // Update variations based on search
    
    // Also trigger AI suggestions (debounced)
    debouncedFetchSuggestions(state.query);
  });
  els.globalSearch.addEventListener('focus', () => {
    if (state.query.trim()) {
      debouncedFetchSuggestions(state.query);
    }
  });
  els.globalSearch.addEventListener('blur', () => {
    setTimeout(hidePromptSuggestions, 120); // allow click
  });
  
  // 監聽輸出框的編輯事件
  els.output.addEventListener('focus', () => {
    isUserEditing = true; // 用戶開始編輯，改為追加模式
    lastSelectedCount = state.selected.length; // 記錄當前已選擇的數量
  });
  
  els.output.addEventListener('input', () => {
    isUserEditing = true; // 用戶正在編輯
    lastSelectedCount = state.selected.length; // 更新已選擇數量，避免重复追加
    saveState(); // 保存用戶編輯的內容
  });
  
  els.output.addEventListener('blur', () => {
    // 失去焦點時，檢查內容是否與自動生成的一致
    const delimiter = els.delimiter.value;
    const useNewlines = els.delimiterNewlines.checked;
    const parts = state.selected.map(s => s.label);
    const autoGenerated = useNewlines ? parts.join('\n') : parts.join(delimiter);
    
    // 如果內容與自動生成的一致，重置編輯狀態
    if (els.output.value.trim() === autoGenerated.trim()) {
      isUserEditing = false;
      lastSelectedCount = state.selected.length;
    }
  });
  
  // keyboard navigation for suggestions
  els.globalSearch.addEventListener('keydown', (e) => {
    const list = els.promptSuggestions;
    if (list.hidden) return;
    const items = Array.from(list.querySelectorAll('.suggestion-item'));
    if (items.length === 0) return;
    const currentIndex = items.findIndex(x => x.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (currentIndex + 1) % items.length;
      items.forEach((it, i) => it.setAttribute('aria-selected', i === next ? 'true' : 'false'));
      items[next].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (currentIndex - 1 + items.length) % items.length;
      items.forEach((it, i) => it.setAttribute('aria-selected', i === prev ? 'true' : 'false'));
      items[prev].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sel = items[currentIndex >= 0 ? currentIndex : 0];
      if (sel) {
        applyPromptSuggestion(sel.querySelector('.title').textContent);
      }
    } else if (e.key === 'Escape') {
      hidePromptSuggestions();
    }
  });
}

function renderAll() {
  // Always render categories with current search filter
  renderCategories();
  renderBreadcrumbs();
  renderSubcategoryFilter();
  renderVariations();
  renderSelected();
  lastSelectedCount = 0; // 重置计数
  updateOutput();
}

async function init() {
  // 先載入資料
  const loaded = await loadData();
  if (!loaded) {
    // 如果載入失敗，顯示錯誤訊息
    if (typeof showToast === 'function') {
      showToast('載入資料失敗，請重新整理頁面');
    } else {
      alert('載入資料失敗，請重新整理頁面');
    }
    return;
  }
  
  // Initialize model selector
  initModelSelector();
  
  // Initialize modular blocks
  initializeBlocks();
  
  // default category
  if (!state.selectedCategoryId) state.selectedCategoryId = DATA[0]?.id;
  restoreState();
  renderAll();
  attachEvents();
}

init();


