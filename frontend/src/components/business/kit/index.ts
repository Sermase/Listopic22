/**
 * Kit compartido de Business Pro (spec §3). Importa siempre desde aquí:
 *
 *   import { SoftCard, SectionHeader, ChipGroup, StickySaveBar, kit } from '../kit';
 *
 * Colores solo con tokens --lt-* (dark, light, warm y cool).
 */

// Estilos y tipos
export { kit, toneClass, toneTextClass, toneSurfaceClass, toneSolidClass, toneBubbleClass, type Tone, type StatusMeta } from './styles';

// Superficies y cabeceras
export { SoftCard, type SoftCardProps } from './SoftCard';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export { HelpToggle, HelpToggleButton, HelpPanel, type HelpToggleProps, type HelpToggleButtonProps, type HelpPanelProps } from './HelpToggle';
export { Disclosure, type DisclosureProps } from './Disclosure';
export { StatusPill, type StatusPillProps } from './StatusPill';
export { ProgressMeter, type ProgressMeterProps, type ProgressDot } from './ProgressMeter';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { PanelError, type PanelErrorProps } from './PanelError';

// Elegir
export { EmojiChip, type EmojiChipProps } from './EmojiChip';
export { ChipGroup, type ChipGroupProps, type ChipOption, type ChipOptionGroup } from './ChipGroup';
export { EmojiTile, type EmojiTileProps } from './EmojiTile';
export { TileGrid, type TileGridProps, type TileGridCols } from './TileGrid';
export { ChoiceCards, type ChoiceCardsProps, type ChoiceOption, type ChoiceColumns } from './ChoiceCards';
export { Switch, type SwitchProps } from './Switch';
export { StepperInput, type StepperInputProps } from './StepperInput';
export { QuickDateRange, type QuickDateRangeProps } from './QuickDateRange';
export { TimeRangeRow, type TimeRangeRowProps } from './TimeRangeRow';

// Escribir y guardar
export { TextField, TextAreaField, type TextFieldProps, type TextAreaFieldProps } from './TextField';
export { CharCounter, type CharCounterProps } from './CharCounter';
export { StickySaveBar, type StickySaveBarProps } from './StickySaveBar';
export { InlineEditable, InlinePriceEditor, type InlineEditableProps, type InlinePriceEditorProps } from './InlineEditable';

// Hooks y contexto
export { useDirtyState, isDeepEqual } from './useDirtyState';
export { BusinessDirtyProvider, useReportDirty, useLeaveGuard, type LeaveGuard } from './BusinessDirtyContext';
export { useCelebrateOnce, launchConfetti } from './useCelebrateOnce';

// Utilidades
export { businessErrorCopy, getErrorCode, DEFAULT_ERROR_COPY, type BusinessErrorCopy, type BusinessErrorAction } from './errors';
export { formatPriceInput, parseMenuPrice, formatEuros, MAX_PRICE_TEXT } from './price';
export { foldText, sameFolded, includesFolded } from './text';
export { prefersReducedMotion } from './motion';
export { toTimeValue, isOvernight, timeRangeError, type TimePeriod } from './time';
export { quickRange, toDateInput, type QuickRangePreset, type DateRangeValue } from './dates';
