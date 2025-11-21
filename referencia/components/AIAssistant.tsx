import React, { useState } from 'react';
import { Sparkles, X, ArrowRight, Wand2, Loader2, Plus, Trash2, Save } from 'lucide-react';
import { generateListTemplate, GeneratedCriteria } from '../services/geminiService';

interface CreateListModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreateListModal: React.FC<CreateListModalProps> = ({ isOpen, onClose }) => {
    const [step, setStep] = useState(1);
    const [topic, setTopic] = useState('');
    const [loading, setLoading] = useState(false);
    const [template, setTemplate] = useState<GeneratedCriteria | null>(null);
    
    // Step 3 State: Adding Items
    const [items, setItems] = useState<{name: string, score: number}[]>([]);
    const [newItemName, setNewItemName] = useState('');

    if (!isOpen) return null;

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!topic.trim()) return;

        setLoading(true);
        const result = await generateListTemplate(topic);
        setTemplate(result);
        setLoading(false);
        setStep(2);
    };

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        if(!newItemName) return;
        // Mock score for demo
        setItems([...items, {name: newItemName, score: Math.floor(Math.random() * 3) + 7}]);
        setNewItemName('');
    }

    const handleSave = () => {
        // Here we would actually save to DB
        // For now, just close
        handleReset();
    }

    const handleReset = () => {
        setStep(1);
        setTopic('');
        setTemplate(null);
        setItems([]);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={handleReset}></div>
            
            <div className="relative w-full max-w-xl bg-surface rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all transform scale-100">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h3 className="font-display font-bold text-xl text-slate-800">
                            {step === 1 ? 'Create New List' : step === 2 ? 'Review Criteria' : 'Add Items'}
                        </h3>
                        <p className="text-sm text-slate-500">
                            {step === 1 ? 'What do you want to rank today?' : step === 2 ? 'AI suggestions' : 'Build your leaderboard'}
                        </p>
                    </div>
                    <button onClick={handleReset} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto custom-scrollbar">
                    {step === 1 && (
                        <form onSubmit={handleGenerate} className="flex flex-col gap-6">
                            <div className="relative group">
                                <div className="absolute -inset-1 bg-brand-gradient rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        placeholder="e.g., Best Burgers in NYC..."
                                        className="w-full bg-white border-2 border-transparent focus:border-primary rounded-xl py-4 pl-6 pr-6 text-lg text-slate-800 placeholder-slate-300 focus:outline-none shadow-sm transition-all"
                                        autoFocus
                                    />
                                    <Wand2 className="absolute right-4 top-1/2 -translate-y-1/2 text-primary opacity-50" />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                {['Best Pizza', 'Hiking Trails', 'Indie Games', 'Craft Beers'].map(s => (
                                    <button 
                                        key={s}
                                        type="button"
                                        onClick={() => setTopic(s)}
                                        className="text-left px-4 py-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-primary text-slate-600 text-sm font-semibold transition-colors border border-slate-100 hover:border-indigo-100"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>

                            <button 
                                type="submit" 
                                disabled={loading || !topic}
                                className="mt-4 w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-300/50 flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                {loading ? 'Generating Criteria...' : 'Start Ranking'}
                            </button>
                        </form>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="text-5xl bg-slate-100 w-20 h-20 flex items-center justify-center rounded-2xl border border-slate-200 shadow-sm">
                                    {template?.emoji}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-display font-bold text-slate-800">{template?.title}</h2>
                                    <p className="text-slate-500 text-sm">Ready to add items</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Ranking Criteria</h4>
                                <div className="space-y-3">
                                    {template?.criteria.map((c, i) => (
                                        <div key={i} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                            <span className="font-semibold text-slate-700">{c.label}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary" style={{width: `${c.weight * 100}%`}}></div>
                                                </div>
                                                <span className="text-xs text-slate-400 font-mono">{(c.weight * 10).toFixed(0)}pts</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button 
                                onClick={() => setStep(3)} 
                                className="w-full py-4 bg-brand-gradient text-white rounded-xl font-bold shadow-lg shadow-primary/30 flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
                            >
                                Next: Add Items <ArrowRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            {/* Add Item Input */}
                            <form onSubmit={handleAddItem} className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Add an item name..."
                                    value={newItemName}
                                    onChange={(e) => setNewItemName(e.target.value)}
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
                                    autoFocus
                                />
                                <button type="submit" className="bg-slate-900 text-white p-3 rounded-xl hover:bg-slate-800">
                                    <Plus className="w-6 h-6" />
                                </button>
                            </form>

                            {/* List of added items */}
                            <div className="bg-slate-50 rounded-2xl p-2 min-h-[150px] border border-slate-100">
                                {items.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-8">
                                        <div className="w-12 h-12 rounded-full bg-slate-100 mb-2 flex items-center justify-center">
                                            <Plus className="w-6 h-6 opacity-50" />
                                        </div>
                                        <p className="text-sm">No items added yet</p>
                                    </div>
                                ) : (
                                    items.map((item, idx) => (
                                        <div key={idx} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 mb-2 flex justify-between items-center animate-fade-in">
                                            <span className="font-bold text-slate-700">{item.name}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-primary bg-indigo-50 px-2 py-1 rounded">{item.score.toFixed(1)}</span>
                                                <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <button 
                                onClick={handleSave}
                                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 transition-all"
                            >
                                <Save className="w-5 h-5" /> Publish List
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreateListModal;