from pathlib import Path
import re
path = Path('public/profile.html')
text = path.read_text(encoding='utf-8', errors='replace')
new_block = '''
                <div class="form-group">
                    <label for="edit-username">Nombre de usuario (sin espacios)</label>
                    <input type="text" id="edit-username" class="form-input" required pattern="^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ0-9._-]{5,20}$" title="5-20 caracteres. Sin espacios. Letras (con acentos), números, puntos, guiones o guion_bajo.">
                    <small class="helper-text subtle">5-20 caracteres, sin espacios. Letras (tildes ok), números, ., _ o -</small>
                </div>
                <div class="form-group">
                    <label for="edit-displayName">Nombre (opcional)</label>
                    <input type="text" id="edit-displayName" class="form-input">
                </div>
                <div class="form-group">
                    <label for="edit-surnames">Apellidos (opcional)</label>
                    <input type="text" id="edit-surnames" class="form-input">
                </div>
'''
pattern = re.compile(r'<div class=\"form-group\">\s*<label for=\"edit-username\">.*?<div class=\"form-group\">\s*<label for=\"edit-surnames\">.*?</div>\s*', re.S)
new_text, n = pattern.subn(new_block, text)
if n == 0:
    raise SystemExit('pattern not replaced')
path.write_text(new_text, encoding='utf-8')
print('replaced', n)
