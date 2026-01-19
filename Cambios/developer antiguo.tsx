                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Descripción Pública</label>
                                                    <textarea
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500 h-20"
                                                        value={editingBadge?.descriptionPublic || ''}
                                                        onChange={e => setEditingBadge({ ...editingBadge, descriptionPublic: e.target.value })}
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Descripción Lógica (Interna)</label>
                                                    <textarea
                                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-amber-200 outline-none focus:border-amber-500 h-20 font-mono text-sm"
                                                        value={editingBadge?.descriptionLogic || ''}
                                                        onChange={e => setEditingBadge({ ...editingBadge, descriptionLogic: e.target.value })}
                                                        placeholder="Explica cuándo se gana esta medalla..."
                                                    />
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Tipo</label>
                                                        <select
                                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                            value={editingBadge?.type || 'custom'}
                                                            onChange={e => setEditingBadge({ ...editingBadge, type: e.target.value })}
                                                        >
                                                            <option value="custom">Custom</option>
                                                            <option value="review_count">Contador Reseñas</option>
                                                            <option value="place_count">Contador Lugares</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Umbral (Threshold)</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                            value={editingBadge?.threshold || 0}
                                                            onChange={e => setEditingBadge({ ...editingBadge, threshold: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Imagen URL</label>
                                                    <div className="flex gap-2 items-center">
                                                        <input
                                                            type="text"
                                                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-amber-500"
                                                            value={editingBadge?.imageUrl || ''}
                                                            onChange={e => setEditingBadge({ ...editingBadge, imageUrl: e.target.value })}
                                                            placeholder="https://..."
                                                        />
                                                        {/* Upload Button */}
                                                        <label className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-colors" title="Subir Icono">
                                                            <Upload className="w-5 h-5 text-gray-400" />
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept="image/*"
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file && editingBadge?.id) {
                                                                        try {
                                                                            const storageRef = ref(storage, `badges/${editingBadge.id}/${Date.now()}_icon`);
                                                                            const snap = await uploadBytes(storageRef, file);
                                                                            const url = await getDownloadURL(snap.ref);
                                                                            setEditingBadge({ ...editingBadge, imageUrl: url });
                                                                        } catch (err) {
                                                                            console.error(err);
                                                                            alert("Error subiendo icono");
                                                                        }
                                                                    } else if (file) {
                                                                        alert("Primero define un ID para la medalla");
                                                                    }
                                                                }}
                                                            />
                                                        </label>

                                                        {editingBadge?.imageUrl && <img src={editingBadge.imageUrl} className="w-10 h-10 object-contain bg-white/5 rounded" />}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 pt-2">
                                                    <input
                                                        type="checkbox"
                                                        id="activeCheck"
                                                        checked={editingBadge?.active !== false}
                                                        onChange={e => setEditingBadge({ ...editingBadge, active: e.target.checked })}
                                                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-amber-600 focus:ring-amber-500"
                                                    />
                                                    <label htmlFor="activeCheck" className="text-sm text-gray-300 select-none">Medalla Activa</label>
                                                </div>

                                            </div >

    <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-[#151b2e]">
        <button
            onClick={() => setBadgeModalOpen(false)}
            className="px-4 py-2 text-gray-400 hover:text-white font-bold transition-colors"
        >
            Cancelar
        </button>
        <button
            onClick={() => handleSaveBadge(editingBadge)}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg shadow-amber-900/20 transition-all hover:scale-105"
        >
            Guardar Medalla
        </button>
    </div>
                                        </div >
                                    </div >
                                )}
                            </div >
                        )}


                    </main >

                </div >
            )}
        </div >
    );
};