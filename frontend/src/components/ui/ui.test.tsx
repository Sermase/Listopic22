import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';
import { Tabs } from './Tabs';
import { Button } from './Button';

describe('Modal', () => {
    it('without footer or size keeps the previous layout (sm:max-w-2xl, caller classes win)', () => {
        render(<Modal isOpen onClose={() => undefined} title="Editar foto" className="sm:max-w-sm">cuerpo</Modal>);
        const dialog = screen.getByRole('dialog', { name: 'Editar foto' });
        const section = dialog.querySelector('section');
        expect(section?.className).toContain('sm:max-w-sm');
        expect(section?.className).not.toContain('sm:max-w-2xl');
        expect(dialog.querySelector('footer')).toBeNull();
    });

    it('renders a footer and maps size', () => {
        render(<Modal isOpen onClose={() => undefined} title="Ficha" size="lg" footer={<button type="button">Guardar ficha</button>}>cuerpo</Modal>);
        const dialog = screen.getByRole('dialog', { name: 'Ficha' });
        expect(dialog.querySelector('section')?.className).toContain('sm:max-w-3xl');
        expect(dialog.querySelector('footer')).toContainElement(screen.getByRole('button', { name: 'Guardar ficha' }));
    });

    it('Escape closes it, except while a confirm dialog is open on top', () => {
        const onClose = vi.fn();
        render(<Modal isOpen onClose={onClose} title="Ficha">cuerpo</Modal>);
        const confirm = document.createElement('div');
        confirm.setAttribute('role', 'alertdialog');
        confirm.setAttribute('aria-modal', 'true');
        document.body.appendChild(confirm);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
        confirm.remove();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('Tabs', () => {
    const options = [
        { value: 'general' as const, label: '📝 Ficha' },
        { value: 'items' as const, label: '📖 Carta', suffix: <span aria-label="Requiere Business Pro">🔒</span> },
    ];

    it('renders suffixes and never wraps labels', () => {
        render(<Tabs value="general" options={options} onChange={() => undefined} />);
        const carta = screen.getByRole('tab', { name: /Carta/ });
        expect(carta).toHaveTextContent('🔒');
        expect(carta.className).toContain('shrink-0');
        expect(carta.className).toContain('whitespace-nowrap');
    });

    it('scrollable wraps the tablist in a horizontal scroller and keeps onChange', () => {
        const onChange = vi.fn();
        render(<Tabs value="general" options={options} onChange={onChange} scrollable ariaLabel="Secciones" className="sticky" />);
        const list = screen.getByRole('tablist', { name: 'Secciones' });
        const scroller = list.parentElement as HTMLElement;
        expect(scroller.className).toContain('overflow-x-auto');
        expect(scroller.className).toContain('snap-x');
        expect(scroller.className).toContain('sticky');
        fireEvent.click(screen.getByRole('tab', { name: /Carta/ }));
        expect(onChange).toHaveBeenCalledWith('items');
    });
});

describe('Button danger', () => {
    it('uses the danger tokens', () => {
        render(<Button variant="danger">Borrar</Button>);
        const className = screen.getByRole('button', { name: 'Borrar' }).className;
        expect(className).toContain('text-[var(--lt-danger)]');
        expect(className).not.toContain('red-200');
    });
});
