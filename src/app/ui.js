import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { TreePreset, TreeType } from '@dgreenheck/ez-tree';
import {
  getBlockDefinitions,
  getBlockDefinition,
  setBlockColor,
  setBlockTexture,
  setBlockModel,
  clearBlockCustom,
  exportBlockConfig,
  importBlockConfig,
  refreshBlockMaterials,
} from './blocks';
import { Environment } from './environment';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import { version } from '../../package.json';

const exporter = new GLTFExporter();

// 预设名称的中文显示名（值仍为英文预设键，用于加载预设）
const presetLabels = {
  'Ash Small': '白蜡树（小）',
  'Ash Medium': '白蜡树（中）',
  'Ash Large': '白蜡树（大）',
  'Aspen Small': '白杨（小）',
  'Aspen Medium': '白杨（中）',
  'Aspen Large': '白杨（大）',
  'Bush 1': '灌木 1',
  'Bush 2': '灌木 2',
  'Bush 3': '灌木 3',
  'Oak Small': '橡树（小）',
  'Oak Medium': '橡树（中）',
  'Oak Large': '橡树（大）',
  'Pine Small': '松树（小）',
  'Pine Medium': '松树（中）',
  'Pine Large': '松树（大）',
  'Trellis': '棚架',
};

// 下拉框的中文显示名（值为库中使用的英文标识）
const treeTypeLabels = {
  落叶树: TreeType.Deciduous,
  常绿树: TreeType.Evergreen,
};

// ============================================================================
// Heroicons (outline style)
// ============================================================================

const icons = {
  // Tab icons
  tree: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-6m0 0l-3-3m3 3l3-3m-3-3V3m0 9l-4-4m4 4l4-4" />
  </svg>`,

  archive: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
  </svg>`,

  // Section icons
  swatch: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
  </svg>`,

  cube: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
  </svg>`,

  share: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
  </svg>`,

  sparkles: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
  </svg>`,

  videoCamera: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>`,

  sun: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
  </svg>`,

  info: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
  </svg>`,

  folder: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
  </svg>`,

  cubeTransparent: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-2.25-1.313M21 7.5v2.25m0-2.25-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3-2.25-1.313M12 12.75l2.25-1.313M12 12.75V15m0 6.75-2.25-1.313M12 21.75V19.5m0 2.25 2.25-1.313m0-16.875L12 2.25l-2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
  </svg>`,

  // Button icons
  dice: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25m8.25-8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 0 0-2.25 2.25v6" />
  </svg>`,

  document: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>`,

  folderOpen: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
  </svg>`,

  download: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>`,

  photo: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>`,

  spinner: `<svg class="icon icon-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="9" opacity="0.25" />
    <path stroke-linecap="round" d="M21 12a9 9 0 0 0-9-9" />
  </svg>`,

  // Arrow icon for sections
  chevronRight: `<svg class="section-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>`,

  chevronRightSmall: `<svg class="subsection-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>`,

  chevronUp: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
  </svg>`,
};

// ============================================================================
// UI Component System
// ============================================================================

/**
 * Creates a slider control with label
 */
function createSlider(label, value, min, max, step, onChange) {
  const container = document.createElement('div');
  container.className = 'control-row';

  const labelEl = document.createElement('label');
  labelEl.className = 'control-label';
  labelEl.textContent = label;

  const sliderWrapper = document.createElement('div');
  sliderWrapper.className = 'slider-wrapper';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'slider';
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = value;

  const valueInput = document.createElement('input');
  valueInput.type = 'number';
  valueInput.className = 'slider-value';
  valueInput.value = formatValue(value, step);
  valueInput.step = step;

  // Fill the track up to the current value so it reads at a glance
  const setFill = () => {
    const pct = ((parseFloat(slider.value) - min) / (max - min || 1)) * 100;
    slider.style.setProperty('--fill', `${pct}%`);
  };
  setFill();

  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valueInput.value = formatValue(val, step);
    setFill();
    onChange(val);
  });

  valueInput.addEventListener('change', (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val)) val = min;
    slider.value = val;
    valueInput.value = formatValue(val, step);
    setFill();
    onChange(val);
  });

  sliderWrapper.appendChild(slider);
  sliderWrapper.appendChild(valueInput);
  container.appendChild(labelEl);
  container.appendChild(sliderWrapper);

  return {
    element: container,
    setValue: (v) => {
      slider.value = v;
      valueInput.value = formatValue(v, step);
      setFill();
    }
  };
}

function formatValue(value, step) {
  if (step >= 1) return Math.round(value).toString();
  const decimals = step.toString().split('.')[1]?.length || 2;
  return value.toFixed(Math.min(decimals, 3));
}

/**
 * Creates a color picker control
 */
function createColorPicker(label, value, onChange) {
  const container = document.createElement('div');
  container.className = 'control-row';

  const labelEl = document.createElement('label');
  labelEl.className = 'control-label';
  labelEl.textContent = label;

  const pickerWrapper = document.createElement('div');
  pickerWrapper.className = 'color-picker-wrapper';

  const colorPreview = document.createElement('div');
  colorPreview.className = 'color-preview';
  colorPreview.style.backgroundColor = '#' + value.toString(16).padStart(6, '0');

  const picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'color-picker';
  picker.value = '#' + value.toString(16).padStart(6, '0');

  picker.addEventListener('input', (e) => {
    const hex = parseInt(e.target.value.slice(1), 16);
    colorPreview.style.backgroundColor = e.target.value;
    onChange(hex);
  });

  pickerWrapper.appendChild(colorPreview);
  pickerWrapper.appendChild(picker);
  container.appendChild(labelEl);
  container.appendChild(pickerWrapper);

  return {
    element: container,
    setValue: (v) => {
      const hexStr = '#' + v.toString(16).padStart(6, '0');
      picker.value = hexStr;
      colorPreview.style.backgroundColor = hexStr;
    }
  };
}

/**
 * Creates a dropdown select control
 */
function createSelect(label, options, value, onChange) {
  const container = document.createElement('div');
  container.className = 'control-row';

  const labelEl = document.createElement('label');
  labelEl.className = 'control-label';
  labelEl.textContent = label;

  const selectWrapper = document.createElement('div');
  selectWrapper.className = 'select-wrapper';

  const select = document.createElement('select');
  select.className = 'select';

  Object.entries(options).forEach(([key, val]) => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = key;
    if (val === value) option.selected = true;
    select.appendChild(option);
  });

  select.addEventListener('change', (e) => {
    onChange(e.target.value);
  });

  selectWrapper.appendChild(select);
  container.appendChild(labelEl);
  container.appendChild(selectWrapper);

  return {
    element: container,
    setValue: (v) => { select.value = v; }
  };
}

/**
 * Creates a checkbox/toggle control
 */
function createToggle(label, value, onChange) {
  const container = document.createElement('div');
  container.className = 'control-row';

  const labelEl = document.createElement('label');
  labelEl.className = 'control-label';
  labelEl.textContent = label;

  const toggleWrapper = document.createElement('div');
  toggleWrapper.className = 'toggle-wrapper';

  const toggle = document.createElement('button');
  toggle.className = 'toggle' + (value ? ' active' : '');
  toggle.innerHTML = '<span class="toggle-knob"></span>';

  toggle.addEventListener('click', () => {
    const newValue = !toggle.classList.contains('active');
    toggle.classList.toggle('active', newValue);
    onChange(newValue);
  });

  toggleWrapper.appendChild(toggle);
  container.appendChild(labelEl);
  container.appendChild(toggleWrapper);

  return {
    element: container,
    setValue: (v) => {
      toggle.classList.toggle('active', v);
    }
  };
}

/**
 * Yields to the browser long enough for pending DOM updates to paint before
 * blocking work resumes on the main thread.
 */
function paint() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0)),
  );
}

/** 触发浏览器下载 */
function downloadBlob(blob, filename) {
  const link = document.getElementById('downloadLink');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Creates a button.
 *
 * `onClick` is called with a `setStatus(text)` callback. If it returns a
 * promise, the button shows a spinner and stays disabled until it settles.
 */
function createButton(label, iconKey, onClick) {
  const button = document.createElement('button');
  button.className = 'panel-button';
  const setContent = (text, key) => {
    button.innerHTML = `${icons[key] || ''}<span>${text}</span>`;
  };
  setContent(label, iconKey);

  let statusSet = false;
  const setStatus = (text) => {
    statusSet = true;
    setContent(text, 'spinner');
  };

  button.addEventListener('click', () => {
    if (button.disabled) return;
    statusSet = false;
    const result = onClick({ setStatus });
    if (!result?.then) return;

    button.disabled = true;
    if (!statusSet) setStatus('处理中…');
    result.finally(() => {
      button.disabled = false;
      setContent(label, iconKey);
    });
  });
  return { element: button };
}

/**
 * Creates a read-only display
 */
function createDisplay(label, value, formatter = (v) => v) {
  const container = document.createElement('div');
  container.className = 'control-row display-row';

  const labelEl = document.createElement('label');
  labelEl.className = 'control-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'display-value';
  valueEl.textContent = formatter(value);

  container.appendChild(labelEl);
  container.appendChild(valueEl);

  return {
    element: container,
    setValue: (v) => { valueEl.textContent = formatter(v); }
  };
}

/**
 * Creates a collapsible section
 */
function createSection(title, iconKey, expanded = false) {
  const section = document.createElement('div');
  section.className = 'panel-section' + (expanded ? ' expanded' : '');

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `
    ${icons[iconKey] || ''}
    <span class="section-title">${title}</span>
    ${icons.chevronRight}
  `;

  const contentWrap = document.createElement('div');
  contentWrap.className = 'section-content';

  const content = document.createElement('div');
  content.className = 'section-content-inner';
  contentWrap.appendChild(content);

  header.addEventListener('click', () => {
    section.classList.toggle('expanded');
  });

  section.appendChild(header);
  section.appendChild(contentWrap);

  return {
    element: section,
    content: content,
    add: (control) => content.appendChild(control.element || control),
    setExpanded: (exp) => section.classList.toggle('expanded', exp)
  };
}

/**
 * Creates a sub-section (nested within a section)
 */
function createSubSection(title, expanded = false) {
  const section = document.createElement('div');
  section.className = 'panel-subsection' + (expanded ? ' expanded' : '');

  const header = document.createElement('div');
  header.className = 'subsection-header';
  header.innerHTML = `
    <span class="subsection-title">${title}</span>
    ${icons.chevronRightSmall}
  `;

  const contentWrap = document.createElement('div');
  contentWrap.className = 'subsection-content';

  const content = document.createElement('div');
  content.className = 'subsection-content-inner';
  contentWrap.appendChild(content);

  header.addEventListener('click', (e) => {
    e.stopPropagation();
    section.classList.toggle('expanded');
  });

  section.appendChild(header);
  section.appendChild(contentWrap);

  return {
    element: section,
    content: content,
    add: (control) => content.appendChild(control.element || control)
  };
}

// ============================================================================
// Main UI Setup
// ============================================================================

let controls = [];

/**
 * Setups the UI
 * @param {Tree} tree
 * @param {Environment} environment
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {OrbitControls} orbitControls
 * @param {String} initialPreset
 * @param {import('./voxelTree').VoxelTree} voxel
 */
export function setupUI(tree, environment, renderer, scene, camera, orbitControls, initialPreset, voxel) {
  const container = document.getElementById('ui-container');
  container.innerHTML = '';
  controls = [];

  // Create main panel
  const panel = document.createElement('div');
  panel.className = 'custom-panel';
  panel.id = 'custom-panel';

  // Panel header with mobile toggle
  const header = document.createElement('div');
  header.className = 'panel-header';
  header.innerHTML = `
    <div class="panel-grabber" aria-hidden="true"></div>
    <button class="panel-mobile-toggle" aria-label="展开/收起面板">
      ${icons.chevronUp}
    </button>
    <h1 class="panel-title">EZ Tree</h1>
    <p class="panel-subtitle">程序化树木生成器</p>
  `;
  panel.appendChild(header);

  // Scrollable content area
  const scrollArea = document.createElement('div');
  scrollArea.className = 'panel-scroll-area';
  panel.appendChild(scrollArea);

  // Tab navigation
  const tabNav = document.createElement('div');
  tabNav.className = 'tab-nav';
  tabNav.innerHTML = `
    <button class="tab-button active" data-tab="parameters">
      ${icons.tree}
      <span class="tab-label">树木</span>
    </button>
    <button class="tab-button" data-tab="export">
      ${icons.archive}
      <span class="tab-label">导出</span>
    </button>
  `;
  scrollArea.appendChild(tabNav);

  const tabButtons = tabNav.querySelectorAll('.tab-button');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // Parameters tab
  const parametersTab = document.createElement('div');
  parametersTab.className = 'tab-content active';
  parametersTab.id = 'tab-parameters';
  scrollArea.appendChild(parametersTab);

  // Export tab
  const exportTab = document.createElement('div');
  exportTab.className = 'tab-content';
  exportTab.id = 'tab-export';
  scrollArea.appendChild(exportTab);

  // ============================================================================
  // Stats Overlay (viewport HUD) + 生长控制
  // ============================================================================

  const statsOverlay = document.createElement('div');
  statsOverlay.id = 'stats-overlay';
  statsOverlay.innerHTML = `
    <div class="stats-counts">
      <div class="stats-stat">
        <span class="stats-value" data-stat="grown">0</span>
        <span class="stats-label">已生长</span>
      </div>
      <div class="stats-stat">
        <span class="stats-value" data-stat="total">0</span>
        <span class="stats-label">树木方块</span>
      </div>
      <div class="stats-stat">
        <span class="stats-value" data-stat="progress">0%</span>
        <span class="stats-label">生长进度</span>
      </div>
    </div>
    <div class="lod-switcher">
      <button class="lod-button active" data-action="toggle">暂停</button>
      <button class="lod-button" data-action="replay">重新生长</button>
    </div>
  `;
  container.appendChild(statsOverlay);

  const statsGrown = statsOverlay.querySelector('[data-stat="grown"]');
  const statsTotal = statsOverlay.querySelector('[data-stat="total"]');
  const statsProgress = statsOverlay.querySelector('[data-stat="progress"]');
  const growthToggleBtn = statsOverlay.querySelector('[data-action="toggle"]');
  const growthReplayBtn = statsOverlay.querySelector('[data-action="replay"]');

  /** Briefly highlights a stat value so live changes are visible */
  function pulseStat(el) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  growthToggleBtn.addEventListener('click', () => {
    voxel.setPlaying(!voxel.playing);
    growthToggleBtn.textContent = voxel.playing ? '暂停' : '继续';
    growthToggleBtn.classList.toggle('active', voxel.playing);
  });

  growthReplayBtn.addEventListener('click', () => {
    voxel.replay();
    growthToggleBtn.textContent = '暂停';
    growthToggleBtn.classList.add('active');
  });

  voxel.onStats = () => updateInfoDisplays();

  // ============================================================================
  // Parameters Tab Content
  // ============================================================================

  let rebuildQueued = false;
  const onChange = () => {
    // 滑块会连续触发，合并到下一帧只重建一次
    if (rebuildQueued) return;
    rebuildQueued = true;
    requestAnimationFrame(() => {
      rebuildQueued = false;
      tree.generate();
      voxel.rebuild(tree, {
        blockSize: voxel.blockSize,
        leafDensity: voxel.leafDensity,
      });
      growthToggleBtn.textContent = '暂停';
      growthToggleBtn.classList.add('active');
      updateInfoDisplays();
    });
  };

  let terrainQueued = false;
  const queueTerrainRebuild = () => {
    if (terrainQueued) return;
    terrainQueued = true;
    requestAnimationFrame(() => {
      terrainQueued = false;
      environment.terrain.rebuild();
      updateInfoDisplays();
    });
  };

  // ----- Presets Section -----
  const presetsSection = createSection('预设', 'swatch', true);

  const presetSelect = createSelect('预设',
    Object.fromEntries(Object.keys(TreePreset).map(p => [presetLabels[p] || p, p])),
    initialPreset,
    (val) => {
      tree.loadPreset(val);
      voxel.rebuild(tree, {
        blockSize: voxel.blockSize,
        leafDensity: voxel.leafDensity,
      });
      growthToggleBtn.textContent = '暂停';
      growthToggleBtn.classList.add('active');
      refreshAllControls();
    }
  );
  presetsSection.add(presetSelect);
  controls.push({ control: presetSelect, update: () => {} });

  const seedSlider = createSlider('随机种子', tree.options.seed, 0, 65536, 1, (val) => {
    tree.options.seed = val;
    onChange();
  });
  presetsSection.add(seedSlider);
  controls.push({ control: seedSlider, update: () => seedSlider.setValue(tree.options.seed) });

  const randomSeedBtn = createButton('随机种子', 'dice', () => {
    tree.options.seed = Math.floor(Math.random() * 65536);
    seedSlider.setValue(tree.options.seed);
    onChange();
  });
  presetsSection.add(randomSeedBtn);

  parametersTab.appendChild(presetsSection.element);

  // 树干 / 树叶的颜色与贴图统一在「方块定义」中设置，
  // 平滑网格的树皮参数不再适用于体素模式。

  // ----- Branches Section -----
  const branchSection = createSection('树枝', 'share', false);

  const treeTypeSelect = createSelect('树木类型', treeTypeLabels, tree.options.type, (val) => {
    tree.options.type = val;
    onChange();
  });
  branchSection.add(treeTypeSelect);
  controls.push({ control: treeTypeSelect, update: () => treeTypeSelect.setValue(tree.options.type) });

  const levelsSlider = createSlider('层级数量', tree.options.branch.levels, 0, 3, 1, (val) => {
    tree.options.branch.levels = val;
    onChange();
  });
  branchSection.add(levelsSlider);
  controls.push({ control: levelsSlider, update: () => levelsSlider.setValue(tree.options.branch.levels) });

  // Angle subsection
  const angleSubsection = createSubSection('角度');
  for (let i = 1; i <= 3; i++) {
    const slider = createSlider(`层级 ${i}`, tree.options.branch.angle[i], 0, 180, 1, (val) => {
      tree.options.branch.angle[i] = val;
      onChange();
    });
    angleSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.angle[i]) });
  }
  branchSection.add(angleSubsection);

  // Children subsection
  const childrenSubsection = createSubSection('子枝数量');
  const childrenRanges = [[0, 100], [1, 10], [2, 5]];
  childrenRanges.forEach(([level, max]) => {
    const slider = createSlider(`层级 ${level}`, tree.options.branch.children[level], 0, max, 1, (val) => {
      tree.options.branch.children[level] = val;
      onChange();
    });
    childrenSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.children[level]) });
  });
  branchSection.add(childrenSubsection);

  // Gnarliness subsection
  const gnarlinessSubsection = createSubSection('弯曲度');
  for (let i = 0; i <= 3; i++) {
    const slider = createSlider(`层级 ${i}`, tree.options.branch.gnarliness[i], -0.5, 0.5, 0.01, (val) => {
      tree.options.branch.gnarliness[i] = val;
      onChange();
    });
    gnarlinessSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.gnarliness[i]) });
  }
  branchSection.add(gnarlinessSubsection);

  // Growth Direction subsection
  const forceSubsection = createSubSection('生长方向');
  ['x', 'y', 'z'].forEach(axis => {
    const slider = createSlider(`方向 ${axis.toUpperCase()}`, tree.options.branch.force.direction[axis], -1, 1, 0.01, (val) => {
      tree.options.branch.force.direction[axis] = val;
      onChange();
    });
    forceSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.force.direction[axis]) });
  });
  const strengthSlider = createSlider('强度', tree.options.branch.force.strength, -0.1, 0.1, 0.001, (val) => {
    tree.options.branch.force.strength = val;
    onChange();
  });
  forceSubsection.add(strengthSlider);
  controls.push({ control: strengthSlider, update: () => strengthSlider.setValue(tree.options.branch.force.strength) });
  branchSection.add(forceSubsection);

  // Length subsection
  const lengthSubsection = createSubSection('长度');
  for (let i = 0; i <= 3; i++) {
    const slider = createSlider(`层级 ${i}`, tree.options.branch.length[i], 0.1, 100, 0.1, (val) => {
      tree.options.branch.length[i] = val;
      onChange();
    });
    lengthSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.length[i]) });
  }
  branchSection.add(lengthSubsection);

  // Radius subsection
  const radiusSubsection = createSubSection('半径');
  for (let i = 0; i <= 3; i++) {
    const slider = createSlider(`层级 ${i}`, tree.options.branch.radius[i], 0.1, 5, 0.01, (val) => {
      tree.options.branch.radius[i] = val;
      onChange();
    });
    radiusSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.radius[i]) });
  }
  branchSection.add(radiusSubsection);

  // Sections subsection
  const sectionsSubsection = createSubSection('分段数');
  for (let i = 0; i <= 3; i++) {
    const slider = createSlider(`层级 ${i}`, tree.options.branch.sections[i], 1, 20, 1, (val) => {
      tree.options.branch.sections[i] = val;
      onChange();
    });
    sectionsSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.sections[i]) });
  }
  branchSection.add(sectionsSubsection);

  // Segments subsection
  const segmentsSubsection = createSubSection('圆周段数');
  for (let i = 0; i <= 3; i++) {
    const slider = createSlider(`层级 ${i}`, tree.options.branch.segments[i], 3, 16, 1, (val) => {
      tree.options.branch.segments[i] = val;
      onChange();
    });
    segmentsSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.segments[i]) });
  }
  branchSection.add(segmentsSubsection);

  // Start subsection
  const startSubsection = createSubSection('起始位置');
  for (let i = 1; i <= 3; i++) {
    const slider = createSlider(`层级 ${i}`, tree.options.branch.start[i], 0, 1, 0.01, (val) => {
      tree.options.branch.start[i] = val;
      onChange();
    });
    startSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.start[i]) });
  }
  branchSection.add(startSubsection);

  // Taper subsection
  const taperSubsection = createSubSection('锥度');
  for (let i = 0; i <= 3; i++) {
    const slider = createSlider(`层级 ${i}`, tree.options.branch.taper[i], 0, 1, 0.01, (val) => {
      tree.options.branch.taper[i] = val;
      onChange();
    });
    taperSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.taper[i]) });
  }
  branchSection.add(taperSubsection);

  // Twist subsection
  const twistSubsection = createSubSection('扭转');
  for (let i = 0; i <= 3; i++) {
    const slider = createSlider(`层级 ${i}`, tree.options.branch.twist[i], -0.5, 0.5, 0.01, (val) => {
      tree.options.branch.twist[i] = val;
      onChange();
    });
    twistSubsection.add(slider);
    controls.push({ control: slider, update: () => slider.setValue(tree.options.branch.twist[i]) });
  }
  branchSection.add(twistSubsection);

  parametersTab.appendChild(branchSection.element);

  // ----- Leaves Section -----
  // 这些参数影响骨架上的叶片分布，进而决定体素树叶的簇位置与大小。
  const leavesSection = createSection('树叶', 'sparkles', false);

  const leafAngleSlider = createSlider('角度', tree.options.leaves.angle, 0, 100, 1, (val) => {
    tree.options.leaves.angle = val;
    onChange();
  });
  leavesSection.add(leafAngleSlider);
  controls.push({ control: leafAngleSlider, update: () => leafAngleSlider.setValue(tree.options.leaves.angle) });

  const leafCountSlider = createSlider('数量', tree.options.leaves.count, 0, 100, 1, (val) => {
    tree.options.leaves.count = val;
    onChange();
  });
  leavesSection.add(leafCountSlider);
  controls.push({ control: leafCountSlider, update: () => leafCountSlider.setValue(tree.options.leaves.count) });

  const leafStartSlider = createSlider('起始位置', tree.options.leaves.start, 0, 1, 0.01, (val) => {
    tree.options.leaves.start = val;
    onChange();
  });
  leavesSection.add(leafStartSlider);
  controls.push({ control: leafStartSlider, update: () => leafStartSlider.setValue(tree.options.leaves.start) });

  const leafSizeSlider = createSlider('大小', tree.options.leaves.size, 0, 10, 0.1, (val) => {
    tree.options.leaves.size = val;
    onChange();
  });
  leavesSection.add(leafSizeSlider);
  controls.push({ control: leafSizeSlider, update: () => leafSizeSlider.setValue(tree.options.leaves.size) });

  const leafVarianceSlider = createSlider('大小差异', tree.options.leaves.sizeVariance, 0, 1, 0.01, (val) => {
    tree.options.leaves.sizeVariance = val;
    onChange();
  });
  leavesSection.add(leafVarianceSlider);
  controls.push({ control: leafVarianceSlider, update: () => leafVarianceSlider.setValue(tree.options.leaves.sizeVariance) });

  parametersTab.appendChild(leavesSection.element);

  // ----- Voxel & Growth Section -----
  const voxelSection = createSection('体素与生长', 'cube', true);

  const treeScaleSlider = createSlider('树木缩放', voxel.treeScale, 0.04, 0.3, 0.01, (val) => {
    voxel.treeScale = val;
    onChange();
  });
  voxelSection.add(treeScaleSlider);
  controls.push({
    control: treeScaleSlider,
    update: () => treeScaleSlider.setValue(voxel.treeScale),
  });

  const blockSizeSlider = createSlider('方块尺寸', voxel.blockSize, 0.25, 3, 0.25, (val) => {
    voxel.blockSize = val;
    environment.terrain.options.blockSize = val;
    onChange();
    queueTerrainRebuild();
  });
  voxelSection.add(blockSizeSlider);
  controls.push({
    control: blockSizeSlider,
    update: () => blockSizeSlider.setValue(voxel.blockSize),
  });

  const growthDurationSlider = createSlider('生长时长 (秒)', voxel.duration, 2, 60, 1, (val) => {
    voxel.setDuration(val);
  });
  voxelSection.add(growthDurationSlider);
  controls.push({
    control: growthDurationSlider,
    update: () => growthDurationSlider.setValue(voxel.duration),
  });

  const leafDensitySlider = createSlider('树叶密度', voxel.leafDensity, 0.2, 2, 0.1, (val) => {
    voxel.leafDensity = val;
    onChange();
  });
  voxelSection.add(leafDensitySlider);
  controls.push({
    control: leafDensitySlider,
    update: () => leafDensitySlider.setValue(voxel.leafDensity),
  });

  const canopyStartSlider = createSlider('树冠起始高度', voxel.canopyStart, 0, 0.8, 0.05, (val) => {
    voxel.canopyStart = val;
    onChange();
  });
  voxelSection.add(canopyStartSlider);
  controls.push({
    control: canopyStartSlider,
    update: () => canopyStartSlider.setValue(voxel.canopyStart),
  });

  const growthProgressDisplay = createDisplay(
    '生长进度',
    voxel.progress,
    (v) => `${Math.round(v * 100)}%`,
  );
  voxelSection.add(growthProgressDisplay);

  const replayGrowthBtn = createButton('重新生长', 'dice', () => {
    voxel.replay();
    growthToggleBtn.textContent = '暂停';
    growthToggleBtn.classList.add('active');
    updateInfoDisplays();
  });
  voxelSection.add(replayGrowthBtn);

  parametersTab.appendChild(voxelSection.element);

  // ----- Block Definition Section -----
  const blockSection = createSection('方块定义', 'swatch', false);

  const blockDefs = getBlockDefinitions();
  const blockTypeOptions = Object.fromEntries(blockDefs.map((d) => [d.label, d.id]));
  let currentBlockId = 'log';

  const blockColorPicker = createColorPicker(
    '颜色',
    getBlockDefinition(currentBlockId).color,
    (val) => {
      setBlockColor(currentBlockId, val);
    },
  );

  const blockTypeSelect = createSelect('方块类型', blockTypeOptions, currentBlockId, (val) => {
    currentBlockId = val;
    blockColorPicker.setValue(getBlockDefinition(val).color);
    const def = getBlockDefinition(val);
    if (def.model) {
      blockStatus.setValue(`当前使用自定义模型：${def.model.name}`);
    } else if (def.textureUrl) {
      blockStatus.setValue('当前使用自定义贴图');
    } else {
      blockStatus.setValue('默认程序化像素纹理');
    }
  });
  blockSection.add(blockTypeSelect);

  blockSection.add(blockColorPicker);
  controls.push({
    control: blockColorPicker,
    update: () => blockColorPicker.setValue(getBlockDefinition(currentBlockId).color),
  });

  const blockStatus = createDisplay('状态', '默认程序化像素纹理');
  blockSection.add(blockStatus);

  const rebuildBlocks = () => {
    refreshBlockMaterials();
    voxel.rebuild(tree, {
      blockSize: voxel.blockSize,
      leafDensity: voxel.leafDensity,
    });
    environment.terrain.rebuild();
    growthToggleBtn.textContent = '暂停';
    growthToggleBtn.classList.add('active');
    updateInfoDisplays();
  };

  // 自定义贴图
  const textureInput = document.createElement('input');
  textureInput.type = 'file';
  textureInput.accept = 'image/*';
  textureInput.style.display = 'none';
  document.body.appendChild(textureInput);

  const importTextureBtn = createButton('导入贴图', 'photo', () => textureInput.click());
  blockSection.add(importTextureBtn);

  textureInput.addEventListener('change', async () => {
    const file = textureInput.files?.[0];
    textureInput.value = '';
    if (!file) return;
    const label = getBlockDefinition(currentBlockId).label;
    try {
      blockStatus.setValue('正在导入贴图…');
      await setBlockTexture(currentBlockId, await readAsDataUrl(file));
      blockStatus.setValue(`已为「${label}」设置自定义贴图`);
    } catch (err) {
      console.error(err);
      blockStatus.setValue('贴图导入失败');
    }
  });

  // 自定义 GLB 模型
  const modelInput = document.createElement('input');
  modelInput.type = 'file';
  modelInput.accept = '.glb,.gltf,model/gltf-binary';
  modelInput.style.display = 'none';
  document.body.appendChild(modelInput);

  const importModelBtn = createButton('导入 GLB 模型', 'cubeTransparent', () => modelInput.click());
  blockSection.add(importModelBtn);

  modelInput.addEventListener('change', async () => {
    const file = modelInput.files?.[0];
    modelInput.value = '';
    if (!file) return;
    const label = getBlockDefinition(currentBlockId).label;
    try {
      blockStatus.setValue('正在导入模型…');
      await setBlockModel(currentBlockId, await readAsArrayBuffer(file), file.name);
      rebuildBlocks();
      blockStatus.setValue(`已为「${label}」设置自定义模型`);
    } catch (err) {
      console.error(err);
      blockStatus.setValue('模型导入失败');
    }
  });

  const clearBlockBtn = createButton('恢复默认外观', 'dice', () => {
    const id = currentBlockId;
    clearBlockCustom(id);
    blockColorPicker.setValue(getBlockDefinition(id).color);
    rebuildBlocks();
    blockStatus.setValue('已恢复默认外观');
  });
  blockSection.add(clearBlockBtn);

  // JSON 方块配置
  const blocksInput = document.createElement('input');
  blocksInput.type = 'file';
  blocksInput.accept = '.json,application/json';
  blocksInput.style.display = 'none';
  document.body.appendChild(blocksInput);

  const exportBlocksConfigBtn = createButton('导出方块配置 JSON', 'download', () => {
    const json = JSON.stringify(exportBlockConfig(), null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), 'blocks.json');
  });
  blockSection.add(exportBlocksConfigBtn);

  const importBlocksConfigBtn = createButton('导入方块配置 JSON', 'folderOpen', () => blocksInput.click());
  blockSection.add(importBlocksConfigBtn);

  blocksInput.addEventListener('change', async () => {
    const file = blocksInput.files?.[0];
    blocksInput.value = '';
    if (!file) return;
    try {
      blockStatus.setValue('正在导入配置…');
      await importBlockConfig(JSON.parse(await file.text()));
      blockColorPicker.setValue(getBlockDefinition(currentBlockId).color);
      rebuildBlocks();
      blockStatus.setValue('方块配置导入完成');
    } catch (err) {
      console.error(err);
      blockStatus.setValue('配置导入失败');
    }
  });

  parametersTab.appendChild(blockSection.element);

  // ----- Terrain Section -----
  const terrainSection = createSection('地形', 'sun', false);
  const terrainOptions = environment.terrain.options;

  const islandRadiusSlider = createSlider('岛屿半径', terrainOptions.radius, 16, 80, 1, (val) => {
    terrainOptions.radius = val;
    queueTerrainRebuild();
  });
  terrainSection.add(islandRadiusSlider);
  controls.push({
    control: islandRadiusSlider,
    update: () => islandRadiusSlider.setValue(terrainOptions.radius),
  });

  const terrainHeightSlider = createSlider('地形起伏', terrainOptions.height, 0, 6, 0.5, (val) => {
    terrainOptions.height = val;
    queueTerrainRebuild();
  });
  terrainSection.add(terrainHeightSlider);
  controls.push({
    control: terrainHeightSlider,
    update: () => terrainHeightSlider.setValue(terrainOptions.height),
  });

  const terrainSeedSlider = createSlider('地形种子', terrainOptions.seed, 0, 9999, 1, (val) => {
    terrainOptions.seed = val;
    queueTerrainRebuild();
  });
  terrainSection.add(terrainSeedSlider);
  controls.push({
    control: terrainSeedSlider,
    update: () => terrainSeedSlider.setValue(terrainOptions.seed),
  });

  const waterToggle = createToggle('水面', terrainOptions.water, (val) => {
    terrainOptions.water = val;
    queueTerrainRebuild();
  });
  terrainSection.add(waterToggle);
  controls.push({ control: waterToggle, update: () => waterToggle.setValue(terrainOptions.water) });

  parametersTab.appendChild(terrainSection.element);

  // ----- Trellis Section -----
  const trellisSection = createSection('棚架', 'share', false);

  const trellisEnabledToggle = createToggle('启用', tree.options.trellis.enabled, (val) => {
    tree.options.trellis.enabled = val;
    onChange();
  });
  trellisSection.add(trellisEnabledToggle);
  controls.push({ control: trellisEnabledToggle, update: () => trellisEnabledToggle.setValue(tree.options.trellis.enabled) });

  const trellisVisibleToggle = createToggle('可见', tree.options.trellis.visible, (val) => {
    tree.options.trellis.visible = val;
    onChange();
  });
  trellisSection.add(trellisVisibleToggle);
  controls.push({ control: trellisVisibleToggle, update: () => trellisVisibleToggle.setValue(tree.options.trellis.visible) });

  // Position subsection
  const trellisPositionSubsection = createSubSection('位置');
  const trellisPosXSlider = createSlider('X', tree.options.trellis.position.x, -20, 20, 0.1, (val) => {
    tree.options.trellis.position.x = val;
    onChange();
  });
  trellisPositionSubsection.add(trellisPosXSlider);
  controls.push({ control: trellisPosXSlider, update: () => trellisPosXSlider.setValue(tree.options.trellis.position.x) });

  const trellisPosYSlider = createSlider('Y', tree.options.trellis.position.y, -10, 10, 0.1, (val) => {
    tree.options.trellis.position.y = val;
    onChange();
  });
  trellisPositionSubsection.add(trellisPosYSlider);
  controls.push({ control: trellisPosYSlider, update: () => trellisPosYSlider.setValue(tree.options.trellis.position.y) });

  const trellisPosZSlider = createSlider('Z', tree.options.trellis.position.z, -20, 20, 0.1, (val) => {
    tree.options.trellis.position.z = val;
    onChange();
  });
  trellisPositionSubsection.add(trellisPosZSlider);
  controls.push({ control: trellisPosZSlider, update: () => trellisPosZSlider.setValue(tree.options.trellis.position.z) });
  trellisSection.add(trellisPositionSubsection);

  // Dimensions subsection
  const trellisDimensionsSubsection = createSubSection('尺寸');
  const trellisWidthSlider = createSlider('宽度', tree.options.trellis.width, 1, 50, 0.5, (val) => {
    tree.options.trellis.width = val;
    onChange();
  });
  trellisDimensionsSubsection.add(trellisWidthSlider);
  controls.push({ control: trellisWidthSlider, update: () => trellisWidthSlider.setValue(tree.options.trellis.width) });

  const trellisHeightSlider = createSlider('高度', tree.options.trellis.height, 1, 50, 0.5, (val) => {
    tree.options.trellis.height = val;
    onChange();
  });
  trellisDimensionsSubsection.add(trellisHeightSlider);
  controls.push({ control: trellisHeightSlider, update: () => trellisHeightSlider.setValue(tree.options.trellis.height) });

  const trellisSpacingSlider = createSlider('间距', tree.options.trellis.spacing, 0.5, 10, 0.1, (val) => {
    tree.options.trellis.spacing = val;
    onChange();
  });
  trellisDimensionsSubsection.add(trellisSpacingSlider);
  controls.push({ control: trellisSpacingSlider, update: () => trellisSpacingSlider.setValue(tree.options.trellis.spacing) });
  trellisSection.add(trellisDimensionsSubsection);

  // Force subsection
  const trellisForceSubsection = createSubSection('作用力');
  const trellisStrengthSlider = createSlider('强度', tree.options.trellis.force.strength, 0, 0.2, 0.001, (val) => {
    tree.options.trellis.force.strength = val;
    onChange();
  });
  trellisForceSubsection.add(trellisStrengthSlider);
  controls.push({ control: trellisStrengthSlider, update: () => trellisStrengthSlider.setValue(tree.options.trellis.force.strength) });

  const trellisMaxDistSlider = createSlider('最大距离', tree.options.trellis.force.maxDistance, 0.5, 20, 0.1, (val) => {
    tree.options.trellis.force.maxDistance = val;
    onChange();
  });
  trellisForceSubsection.add(trellisMaxDistSlider);
  controls.push({ control: trellisMaxDistSlider, update: () => trellisMaxDistSlider.setValue(tree.options.trellis.force.maxDistance) });

  const trellisFalloffSlider = createSlider('衰减', tree.options.trellis.force.falloff, 0.1, 3, 0.1, (val) => {
    tree.options.trellis.force.falloff = val;
    onChange();
  });
  trellisForceSubsection.add(trellisFalloffSlider);
  controls.push({ control: trellisFalloffSlider, update: () => trellisFalloffSlider.setValue(tree.options.trellis.force.falloff) });
  trellisSection.add(trellisForceSubsection);

  // Appearance subsection
  const trellisAppearanceSubsection = createSubSection('外观');
  const trellisCylinderRadiusSlider = createSlider('圆柱半径', tree.options.trellis.cylinderRadius, 0.01, 0.5, 0.01, (val) => {
    tree.options.trellis.cylinderRadius = val;
    onChange();
  });
  trellisAppearanceSubsection.add(trellisCylinderRadiusSlider);
  controls.push({ control: trellisCylinderRadiusSlider, update: () => trellisCylinderRadiusSlider.setValue(tree.options.trellis.cylinderRadius) });

  const trellisColorPicker = createColorPicker('颜色', tree.options.trellis.color, (val) => {
    tree.options.trellis.color = val;
    onChange();
  });
  trellisAppearanceSubsection.add(trellisColorPicker);
  controls.push({ control: trellisColorPicker, update: () => trellisColorPicker.setValue(tree.options.trellis.color) });
  trellisSection.add(trellisAppearanceSubsection);

  parametersTab.appendChild(trellisSection.element);

  // ----- Camera Section -----
  const cameraSection = createSection('相机', 'videoCamera', false);

  const autoRotateToggle = createToggle('自动旋转', orbitControls.autoRotate, (val) => {
    orbitControls.autoRotate = val;
  });
  cameraSection.add(autoRotateToggle);
  controls.push({ control: autoRotateToggle, update: () => autoRotateToggle.setValue(orbitControls.autoRotate) });

  const rotateSpeedSlider = createSlider('旋转速度', orbitControls.autoRotateSpeed, 0, 2, 0.1, (val) => {
    orbitControls.autoRotateSpeed = val;
  });
  cameraSection.add(rotateSpeedSlider);
  controls.push({ control: rotateSpeedSlider, update: () => rotateSpeedSlider.setValue(orbitControls.autoRotateSpeed) });

  parametersTab.appendChild(cameraSection.element);

  // ----- Environment Section -----
  const environmentSection = createSection('环境', 'sun', false);

  const sunAzimuthSlider = createSlider('太阳角度', environment.skybox.sunAzimuth, 0, 360, 1, (val) => {
    environment.skybox.sunAzimuth = val;
  });
  environmentSection.add(sunAzimuthSlider);
  controls.push({ control: sunAzimuthSlider, update: () => sunAzimuthSlider.setValue(environment.skybox.sunAzimuth) });

  const sunElevationSlider = createSlider('太阳高度', environment.skybox.sunElevation, 5, 85, 1, (val) => {
    environment.skybox.sunElevation = val;
  });
  environmentSection.add(sunElevationSlider);
  controls.push({ control: sunElevationSlider, update: () => sunElevationSlider.setValue(environment.skybox.sunElevation) });

  parametersTab.appendChild(environmentSection.element);

  // ----- Info Section -----
  const infoSection = createSection('信息', 'info', false);

  const totalBlocksDisplay = createDisplay('树木方块', voxel.counts.total, (v) => Math.round(v).toLocaleString());
  infoSection.add(totalBlocksDisplay);

  const logBlocksDisplay = createDisplay('树干方块', voxel.counts.log, (v) => Math.round(v).toLocaleString());
  infoSection.add(logBlocksDisplay);

  const leafBlocksDisplay = createDisplay('树叶方块', voxel.counts.leaves, (v) => Math.round(v).toLocaleString());
  infoSection.add(leafBlocksDisplay);

  const terrainBlocksDisplay = createDisplay('地形方块', environment.terrain.blockCount, (v) => Math.round(v).toLocaleString());
  infoSection.add(terrainBlocksDisplay);

  const treeHeightDisplay = createDisplay('树高（方块）', voxel.heightBlocks);
  infoSection.add(treeHeightDisplay);

  const versionDisplay = createDisplay('版本', version);
  infoSection.add(versionDisplay);

  const aboutBtn = createButton('关于', 'info', () => {
    document.getElementById('aboutOverlay').classList.add('active');
  });
  infoSection.add(aboutBtn);

  parametersTab.appendChild(infoSection.element);

  let lastStatsGrown = -1;

  function updateInfoDisplays() {
    totalBlocksDisplay.setValue(voxel.counts.total);
    logBlocksDisplay.setValue(voxel.counts.log);
    leafBlocksDisplay.setValue(voxel.counts.leaves);
    terrainBlocksDisplay.setValue(environment.terrain.blockCount);
    treeHeightDisplay.setValue(voxel.heightBlocks);
    growthProgressDisplay.setValue(voxel.progress);

    statsGrown.textContent = Math.round(voxel.grown).toLocaleString();
    statsTotal.textContent = Math.round(voxel.counts.total).toLocaleString();
    statsProgress.textContent = `${Math.round(voxel.progress * 100)}%`;

    if (voxel.grown !== lastStatsGrown) {
      lastStatsGrown = voxel.grown;
      pulseStat(statsGrown);
      pulseStat(statsProgress);
    }
  }

  // ============================================================================
  // Export Tab Content
  // ============================================================================

  const exportSection = createSection('保存与加载', 'folder', true);

  const savePresetBtn = createButton('保存预设', 'document', () => {
    const link = document.getElementById('downloadLink');
    const json = JSON.stringify(tree.options, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    link.href = URL.createObjectURL(blob);
    link.download = 'tree.json';
    link.click();
  });
  exportSection.add(savePresetBtn);

  const loadPresetBtn = createButton('加载预设', 'folderOpen', () => {
    document.getElementById('fileInput').click();
  });
  exportSection.add(loadPresetBtn);

  exportTab.appendChild(exportSection.element);

  const exportModelsSection = createSection('导出模型', 'cubeTransparent', true);

  /**
   * GLTFExporter aborts on textures whose image never loaded (e.g. the
   * texture file is missing on disk). Rendering tolerates them, so strip
   * them from the materials for the duration of an export and restore after.
   * @param {THREE.Object3D} root
   * @returns {() => void} restore function
   */
  function stripBrokenTextures(root) {
    const restores = [];
    root.traverse((o) => {
      const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const material of materials) {
        for (const key of ['map', 'aoMap', 'normalMap', 'roughnessMap', 'metalnessMap']) {
          const texture = material[key];
          if (texture?.isTexture && !texture.image) {
            restores.push(() => { material[key] = texture; });
            material[key] = null;
          }
        }
      }
    });
    return () => restores.forEach((restore) => restore());
  }

  const exportGlbBtn = createButton('导出 GLB（体素树）', 'download', async ({ setStatus }) => {
    setStatus('正在导出 GLB…');
    const restoreTextures = stripBrokenTextures(tree);
    let group = null;
    try {
      await paint();
      group = voxel.toMergedGroup();
      const glb = await new Promise((resolve, reject) =>
        exporter.parse(group, resolve, reject, { binary: true }),
      );
      downloadBlob(new Blob([glb], { type: 'application/octet-stream' }), 'voxel-tree.glb');
    } catch (err) {
      console.error(err);
    } finally {
      restoreTextures();
      group?.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
    }
  });
  exportModelsSection.add(exportGlbBtn);

  const exportBlocksBtn = createButton('导出方块数据 JSON', 'document', () => {
    const data = voxel.exportBlocksJson();
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      'voxel-blocks.json',
    );
  });
  exportModelsSection.add(exportBlocksBtn);

  const exportPngBtn = createButton('导出 PNG', 'photo', async ({ setStatus }) => {
    setStatus('正在导出 PNG…');
    await paint();

    renderer.setClearColor(0, 0);
    const fog = scene.fog;
    scene.fog = null;

    // 记录可见性，导出后原样恢复
    const visibility = [];
    scene.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) visibility.push([o, o.visible]);
    });

    scene.traverse((o) => {
      if (o.name === 'Skybox') {
        o.material.side = THREE.FrontSide;
      } else if (o.isMesh || o.isInstancedMesh) {
        o.visible = false;
      }
    });
    // 只保留体素树
    voxel.traverse((o) => {
      if (o.isInstancedMesh) o.visible = true;
    });

    try {
      renderer.render(scene, camera);
      const link = document.getElementById('downloadLink');
      link.href = renderer.domElement.toDataURL('image/png');
      link.download = 'voxel-tree.png';
      link.click();
    } catch (err) {
      console.error(err);
    } finally {
      renderer.setClearColor(0);
      scene.fog = fog;
      scene.traverse((o) => {
        if (o.name === 'Skybox') {
          o.material.side = THREE.BackSide;
        }
      });
      for (const [o, visible] of visibility) o.visible = visible;
    }
  });
  exportModelsSection.add(exportPngBtn);

  exportTab.appendChild(exportModelsSection.element);

  // Panel footer with course link
  const footer = document.createElement('div');
  footer.className = 'panel-footer';
  footer.innerHTML = `
    <p class="panel-footer-heading">喜欢 EZ-Tree？试试我的其他资源</p>
    <a href="https://threejsroadmap.com/assets/threejs-water-pro?utm_source=eztree" target="_blank" class="panel-footer-link">
      🌊 Three.js Water Pro
    </a>
    <a href="https://threejsroadmap.com/assets/threejs-sky-pro?utm_source=eztree" target="_blank" class="panel-footer-link">
      ☁️ Three.js Sky Pro
    </a>
  `;
  panel.appendChild(footer);

  // Add panel to container
  container.appendChild(panel);

  // File input handler
  const fileInput = document.getElementById('fileInput');
  const newFileInput = fileInput.cloneNode(true);
  fileInput.parentNode.replaceChild(newFileInput, fileInput);

  newFileInput.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          tree.options = JSON.parse(e.target.result);
          tree.generate();
          voxel.rebuild(tree, {
            blockSize: voxel.blockSize,
            leafDensity: voxel.leafDensity,
          });
          growthToggleBtn.textContent = '暂停';
          growthToggleBtn.classList.add('active');
          refreshAllControls();
        } catch (error) {
          console.error('Error parsing JSON:', error);
        }
      };
      reader.onerror = function (e) {
        console.error('Error reading file:', e);
      };
      reader.readAsText(file);
    }
    // Reset file input
    newFileInput.value = '';
  });

  // Refresh all controls to match current tree options
  function refreshAllControls() {
    controls.forEach(({ update }) => update());
    updateInfoDisplays();
  }

  // Initialize the stats overlay with the current tree's counts
  updateInfoDisplays();

  // Mobile expand/collapse functionality
  setupMobileToggle(panel, header);
}

/**
 * Sets up the mobile bottom sheet: the whole header is the tap target,
 * and the panel starts collapsed so the scene stays the hero.
 */
function setupMobileToggle(panel, header) {
  const mobileQuery = window.matchMedia('(max-width: 800px)');

  header.addEventListener('click', () => {
    if (!mobileQuery.matches) return;
    panel.classList.toggle('collapsed');
  });

  if (mobileQuery.matches) {
    panel.classList.add('collapsed');
  }
}
