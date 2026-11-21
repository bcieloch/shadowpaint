import type { RightTabId } from '@/core/layout';
import type { ShortcutItemId } from '@/core/shortcuts';
import type { MapId } from '@/core/types';

export type GuideTabId = 'tutorial' | 'features';

export type TutorialStepId =
  | 'canvasAndImport'
  | 'mapsAndPainting'
  | 'selectionAndAdjustments'
  | 'lightingAndOptics'
  | 'measurementAndSection'
  | 'persistenceAndExport';

export type FeatureCategoryId =
  | 'mapsAndImport'
  | 'paintingAndMasking'
  | 'lightingAndOptics'
  | 'measurementAndSection'
  | 'workspaceAndShortcuts'
  | 'persistenceAndExport';

export type TutorialToolTarget =
  | 'brush'
  | 'eraser'
  | 'smooth'
  | 'blur'
  | 'gradient'
  | 'fill'
  | 'eyedropper'
  | 'pan'
  | 'selectRect'
  | 'selectEllipse'
  | 'selectLasso'
  | 'magicWand'
  | 'maskBrush'
  | 'ruler'
  | 'crossSection';

export type TutorialLayoutTarget = '2d' | '3d' | 'split';

export interface TutorialStepAction {
  kind:
    | 'openNewProject'
    | 'openImportWizard'
    | 'selectTool'
    | 'setLayout'
    | 'setRightTab'
    | 'openShortcuts';
  tool?: TutorialToolTarget;
  activeMap?: MapId;
  layout?: TutorialLayoutTarget;
  rightTab?: RightTabId;
}

export interface TutorialStepDef {
  id: TutorialStepId;
  stepNumber: number;
  shortcutId?: ShortcutItemId;
  action: TutorialStepAction;
}

export interface FeatureGuideSectionDef {
  id: FeatureCategoryId;
  shortcutIds: readonly ShortcutItemId[];
}

export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  {
    id: 'canvasAndImport',
    stepNumber: 1,
    shortcutId: 'fileImport',
    action: { kind: 'openImportWizard' },
  },
  {
    id: 'mapsAndPainting',
    stepNumber: 2,
    shortcutId: 'toolBrush',
    action: {
      kind: 'selectTool',
      tool: 'brush',
      activeMap: 'height',
      layout: '2d',
      rightTab: 'map',
    },
  },
  {
    id: 'selectionAndAdjustments',
    stepNumber: 3,
    shortcutId: 'toolMaskBrush',
    action: { kind: 'selectTool', tool: 'maskBrush', layout: '2d', rightTab: 'map' },
  },
  {
    id: 'lightingAndOptics',
    stepNumber: 4,
    shortcutId: 'layoutSplit',
    action: { kind: 'setLayout', layout: 'split', rightTab: 'light' },
  },
  {
    id: 'measurementAndSection',
    stepNumber: 5,
    shortcutId: 'toolCrossSection',
    action: { kind: 'selectTool', tool: 'crossSection', layout: 'split', rightTab: 'section' },
  },
  {
    id: 'persistenceAndExport',
    stepNumber: 6,
    shortcutId: 'fileExport',
    action: { kind: 'setRightTab', rightTab: 'export' },
  },
];

export const FEATURE_GUIDE_SECTIONS: readonly FeatureGuideSectionDef[] = [
  {
    id: 'mapsAndImport',
    shortcutIds: ['fileImport', 'activeMap', 'activeMapHeight', 'activeMapOpacity'],
  },
  {
    id: 'paintingAndMasking',
    shortcutIds: [
      'toolBrush',
      'toolEraser',
      'toolSmooth',
      'toolBlur',
      'toolGradient',
      'toolFill',
      'toolSelectRect',
      'toolMagicWand',
      'toolMaskBrush',
    ],
  },
  {
    id: 'lightingAndOptics',
    shortcutIds: ['layout2d', 'layout3d', 'layoutSplit', 'reset3d'],
  },
  {
    id: 'measurementAndSection',
    shortcutIds: ['toolRuler', 'toolCrossSection', 'toggleGrid', 'toggleRulers'],
  },
  {
    id: 'workspaceAndShortcuts',
    shortcutIds: ['openShortcuts', 'openGuide', 'togglePanels', 'historyUndo', 'historyUndoMap'],
  },
  {
    id: 'persistenceAndExport',
    shortcutIds: ['fileNew', 'fileOpen', 'fileSave', 'fileSaveAs', 'fileExport'],
  },
];
