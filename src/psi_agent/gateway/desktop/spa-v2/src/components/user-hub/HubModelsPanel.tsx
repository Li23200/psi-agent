import { useEffect, useMemo, useState } from 'react'
import { Bot, Trash2 } from 'lucide-react'
import type { AiInfo } from '../../services/api'
import { createAi, deleteAi, listAis } from '../../services/api'
import {
  aiConfigKey,
  DEFAULT_REMOTE_AI,
  dedupeAisForDisplay,
  hydrateAiForSessions,
  isPlaceholderAi,
  writeStoredAiId,
} from '../../services/bootstrapAi'
import {
  getModelPreset,
  MODEL_PRESETS,
  type ModelPreset,
  presetToAiPayload,
} from '../../services/modelPresets'
import { useI18n } from '../../i18n'
import HubDialog from './HubDialog'

type Props = {
  show: boolean
  onClose: () => void
  selectedAiId: string | null
  onSelectAi: (id: string | null) => void
  onOpenAdvanced: () => void
  onToast?: (message: string, durationMs?: number) => void
  onFreeModelNotice?: () => void
  onAisChanged?: (ais: AiInfo[]) => void
}

export default function HubModelsPanel({
  show,
  onClose,
  selectedAiId,
  onSelectAi,
  onOpenAdvanced,
  onToast,
  onFreeModelNotice,
  onAisChanged,
}: Props) {
  const { t } = useI18n();
  const [ais, setAis] = useState<AiInfo[]>([])
  const [presetId, setPresetId] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [pendingConnectedId, setPendingConnectedId] = useState<string | null>(null)

  const preset = useMemo(
    () => (presetId ? getModelPreset(presetId) : undefined),
    [presetId],
  )

  const visibleAis = useMemo(
    () => dedupeAisForDisplay(ais, selectedAiId),
    [ais, selectedAiId],
  )
  const labelFor = (p: ModelPreset) => t(`presetModel.${p.id}.label`)
  const hintFor = (p: ModelPreset) => t(`presetModel.${p.id}.hint`)

  useEffect(() => {
    if (!show) return
    setPresetId(null)
    setApiKey('')
    setConnecting(false)
    setPendingConnectedId(null)
    void listAis()
      .then((list) => {
        setAis(list)
        onAisChanged?.(list)
      })
      .catch((e) => onToast?.(e instanceof Error ? e.message : t('models.loadFailed')))
  }, [show, onAisChanged, onToast])

  const connect = async () => {
    if (connecting) return
    if (!pendingConnectedId && (!preset || !apiKey.trim())) return
    setConnecting(true)
    try {
      if (pendingConnectedId) {
        onSelectAi(pendingConnectedId)
        writeStoredAiId(pendingConnectedId)
        onClose()
        return
      }
      const info = await createAi(presetToAiPayload(preset, apiKey))
      const list = await listAis()
      setAis(list)
      onAisChanged?.(list)
      onSelectAi(info.id)
      writeStoredAiId(info.id)
      onToast?.(t('models.connected', { name: labelFor(preset) }))
      onClose()
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : t('models.connectFailed'))
    } finally {
      setConnecting(false)
    }
  }

  /** Free model = keep user-connected AIs, force-select the remote free entry.
   * No free entry yet → create the default remote so the switch works even
   * with real keys present. */
  const useFreeModel = async () => {
    if (connecting) return
    setConnecting(true)
    try {
      let { ais } = await hydrateAiForSessions(null)
      let free = ais.find((a) => isPlaceholderAi(a)) ?? null
      if (!free) {
        try {
          free = await createAi({ ...DEFAULT_REMOTE_AI })
          if (free?.id) ais = await listAis()
        } catch {
          free = null
        }
      }
      setAis(ais)
      onAisChanged?.(ais)
      if (free?.id) {
        onSelectAi(free.id)
        writeStoredAiId(free.id)
        onToast?.(t('models.freeNotice'), 6000)
        onFreeModelNotice?.()
      } else {
        onSelectAi(null)
        onToast?.(t('models.freeUnavailable'))
      }
      onClose()
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : t('models.freeSwitchFailed'))
    } finally {
      setConnecting(false)
    }
  }

  const removeAi = async (a: AiInfo) => {
    const name = a.model || a.id
    if (!window.confirm(t('models.confirmDelete', { name }))) return
    // One row can represent several same-config instances (e.g. free remotes
    // revived per Session); delete the whole config group in one click.
    const group = ais.filter((x) => aiConfigKey(x) === aiConfigKey(a))
    const groupIds = new Set(group.map((x) => x.id))
    const removedSelected = selectedAiId != null && groupIds.has(selectedAiId)
    try {
      await Promise.all(group.map((x) => deleteAi(x.id)))
      if (removedSelected) {
        onSelectAi(null)
        writeStoredAiId(null)
      }
      setPendingConnectedId((cur) => (cur && groupIds.has(cur) ? null : cur))
      const list = await listAis()
      setAis(list)
      onAisChanged?.(list)
      onToast?.(t('models.deleted', { name }))
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : t('models.deleteFailed'))
    }
  }

  return (
    <HubDialog
      show={show}
      width={560}
      onClose={onClose}
      title={(
        <div className="hub-models-title">
          <span>{t('app.models')}</span>
          <button
            type="button"
            className="hub-link"
            onClick={() => {
              onClose()
              onOpenAdvanced()
            }}
          >
            {t('models.advanced')}
          </button>
        </div>
      )}
      actions={(
        <>
          <button
            type="button"
            className="hub-btn primary soft"
            disabled={connecting}
            onClick={() => void useFreeModel()}
          >
            {t('models.useFree')}
          </button>
          <button
            type="button"
            className="hub-btn primary"
            disabled={connecting || !((preset && apiKey.trim()) || pendingConnectedId)}
            onClick={() => void connect()}
          >
            {connecting ? t('models.connecting') : t('models.connect')}
          </button>
        </>
      )}
    >
      {visibleAis.length > 0 && (
        <section className="hub-section">
          <h4>{t('models.connectedSection')}</h4>
          <ul className="hub-ai-list">
            {visibleAis.map((a) => (
              <li key={a.id}>
                <div className="hub-ai-row-wrap">
                  <button
                    type="button"
                    className={`hub-ai-row ${a.id === selectedAiId || a.id === pendingConnectedId ? 'active' : ''}`}
                    onClick={() => {
                      setPendingConnectedId(a.id)
                      setPresetId(null)
                      setApiKey('')
                    }}
                  >
                    <Bot size={18} />
                    <span className="hub-ai-info">
                      <strong>{a.model || a.id}</strong>
                      <em>{a.provider}</em>
                    </span>
                    {a.id === selectedAiId ? <span className="hub-badge">{t('models.current')}</span> : a.id === pendingConnectedId ? <span className="hub-badge">{t('models.pendingConnect')}</span> : null}
                  </button>
                  <button
                    type="button"
                    className="hub-ai-delete"
                    onClick={() => void removeAi(a)}
                    aria-label={t('models.deleteAria', { model: a.model || a.id })}
                    title={t('models.delete')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="hub-section">
        <h4>{t('models.selectModel')}</h4>
        <div className="hub-preset-grid">
          {MODEL_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`hub-preset-card ${presetId === p.id ? 'active' : ''}`}
              title={hintFor(p) || p.label}
              onClick={() => {
                setPendingConnectedId(null)
                setPresetId(p.id)
                setApiKey('')
              }}
            >
              <span className="hub-preset-mark" style={{ background: `${p.accent}22`, color: p.accent }}>
                {p.mark}
              </span>
              <span>{labelFor(p)}</span>
            </button>
          ))}
        </div>
      </section>

      {preset && (
        <section className="hub-section hub-key-box">
          <h4>{t('models.apiKey')}</h4>
          <p>
            {t('models.connectTo')} <strong>{labelFor(preset)}</strong>
            <span> · {preset.model}</span>
          </p>
          <input
            type="password"
            value={apiKey}
            placeholder="sk-..."
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void connect()
              }
            }}
          />
        </section>
      )}
    </HubDialog>
  )
}
