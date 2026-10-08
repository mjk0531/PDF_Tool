import type { ReactNode } from 'react'
import { defineMessages } from '..'

/** Password tool. */
export default defineMessages({
  en: {
    mode: 'Mode',
    modes: {
      remove: 'Remove',
      add: 'Add',
    },
    working: 'Working...',
    stripEncryption: 'Strip encryption',
    addPassword: 'Add password',
    addUnavailableTitle: 'Adding passwords requires native encryption (not available in browser)',
    addUnavailableAlert:
      'Adding password protection requires native PDF encryption support that pure browser libraries do not implement. This action is disabled.',
    /** `tool` is the styled name of the suggested desktop tool (qpdf). */
    addExplanation: (tool: ReactNode) => (
      <>
        Adding password protection requires native PDF encryption (RC4 / AES). Browser-side libraries do not implement
        encryption — only decryption / removal. Use a desktop tool such as {tool} for adding passwords.
      </>
    ),
    encrypted: 'Encrypted',
    notEncrypted: 'Not encrypted',
    passwordLabel: 'Password (if known)',
    passwordHint: 'Optional. Some PDFs have only restrictions and can be stripped without a password.',
    passwordPlaceholder: 'Leave blank if unknown',
    failed: 'Operation failed',
    stripped: 'Encryption stripped',
    unrestricted: 'output is unrestricted',
    downloadUnlocked: 'Download unlocked PDF',
    nothingToRemove: 'This PDF has no encryption to remove.',
  },
  ko: {
    mode: '모드',
    modes: {
      remove: '제거',
      add: '추가',
    },
    working: '처리 중...',
    stripEncryption: '암호화 해제',
    addPassword: '비밀번호 추가',
    addUnavailableTitle: '비밀번호를 추가하려면 네이티브 암호화가 필요합니다 (브라우저에서는 지원되지 않음)',
    addUnavailableAlert:
      '비밀번호 보호를 추가하려면 네이티브 PDF 암호화가 필요하지만, 브라우저용 라이브러리는 이를 구현하지 않습니다. 이 기능은 비활성화되어 있습니다.',
    addExplanation: (tool) => (
      <>
        비밀번호 보호를 추가하려면 네이티브 PDF 암호화(RC4 / AES)가 필요합니다. 브라우저용 라이브러리는 암호화를
        구현하지 않으며 복호화와 제거만 지원합니다. 비밀번호를 추가하려면 {tool} 같은 데스크톱 도구를 사용하세요.
      </>
    ),
    encrypted: '암호화됨',
    notEncrypted: '암호화되지 않음',
    passwordLabel: '비밀번호 (알고 있는 경우)',
    passwordHint: '선택 사항입니다. 일부 PDF는 사용 제한만 걸려 있어 비밀번호 없이 해제할 수 있습니다.',
    passwordPlaceholder: '모르면 비워 두세요',
    failed: '작업에 실패했습니다',
    stripped: '암호화 해제 완료',
    unrestricted: '모든 제한 해제됨',
    downloadUnlocked: '잠금 해제된 PDF 다운로드',
    nothingToRemove: '이 PDF에는 해제할 암호화가 없습니다.',
  },
  es: {
    mode: 'Modo',
    modes: {
      remove: 'Quitar',
      add: 'Añadir',
    },
    working: 'Procesando...',
    stripEncryption: 'Quitar cifrado',
    addPassword: 'Añadir contraseña',
    addUnavailableTitle: 'Añadir contraseñas requiere cifrado nativo (no disponible en el navegador)',
    addUnavailableAlert:
      'Proteger con contraseña requiere cifrado nativo de PDF, que las bibliotecas del navegador no implementan. Esta acción está desactivada.',
    addExplanation: (tool) => (
      <>
        Proteger con contraseña requiere cifrado nativo de PDF (RC4 / AES). Las bibliotecas del navegador no implementan
        el cifrado, solo el descifrado o la eliminación. Para añadir contraseñas, usa una herramienta de escritorio como{' '}
        {tool}.
      </>
    ),
    encrypted: 'Cifrado',
    notEncrypted: 'Sin cifrar',
    passwordLabel: 'Contraseña (si la sabes)',
    passwordHint: 'Opcional. Algunos PDF solo tienen restricciones y se pueden desbloquear sin contraseña.',
    passwordPlaceholder: 'Déjalo vacío si no la sabes',
    failed: 'Error en la operación',
    stripped: 'Cifrado eliminado',
    unrestricted: 'el resultado no tiene restricciones',
    downloadUnlocked: 'Descargar PDF desbloqueado',
    nothingToRemove: 'Este PDF no tiene cifrado que quitar.',
  },
})
