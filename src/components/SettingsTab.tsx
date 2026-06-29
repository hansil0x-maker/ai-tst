import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Save, Download, Upload, Shield } from 'lucide-react';
import { exportDB, importInto } from 'dexie-export-import';
import toast from 'react-hot-toast';

export default function SettingsTab() {
  const settings = useLiveQuery(() => db.settings.get(1));
  const [schoolName, setSchoolName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Update local state when settings load
  React.useEffect(() => {
    if (settings) {
      setSchoolName(settings.schoolName || '');
      setTeacherName(settings.teacherName || '');
      setAcademicYear(settings.academicYear || '');
    }
  }, [settings]);

  const handleSave = async () => {
    if (settings && settings.id) {
      await db.settings.update(settings.id, { 
        schoolName: schoolName || settings.schoolName, 
        teacherName: teacherName || settings.teacherName,
        academicYear: academicYear || settings.academicYear 
      });
      if (newPassword.length >= 4) {
        await db.settings.update(settings.id, { userPasswordHash: newPassword });
        setNewPassword('');
        toast.success('تم تحديث كلمة المرور وحفظ الإعدادات!');
      } else if (newPassword.length > 0) {
        toast.error('كلمة المرور يجب أن لا تقل عن 4 أحرف');
      } else {
        toast.success('تم حفظ الإعدادات بنجاح!');
      }
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportDB(db);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NexusEdu_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      toast.success('تم تصدير النسخة الاحتياطية بنجاح.');
    } catch (e) {
      toast.error('فشل التصدير: ' + e);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await db.delete();
      await db.open(); // recreation
      await importInto(db, file);
      toast.success('تمت استعادة قاعدة البيانات بنجاح! جاري إعادة التحميل...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error('فشل الاستيراد: ' + err);
    }
  };

  if (!settings) return null;

  return (
    <div className="space-y-6 pb-20">
      <h2 className="text-2xl font-semibold border-b border-slate-700 pb-4">الإعدادات</h2>

      <div className="space-y-4">
        <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 space-y-4">
          <h3 className="font-medium text-lg flex items-center space-x-2 space-x-reverse text-white"><Shield size={20} className="text-blue-500" /> <span>إعدادات عامة</span></h3>
          <div>
             <label className="block text-sm text-slate-400 mb-1">اسم المدرسة</label>
             <input type="text" value={schoolName} onChange={e=>setSchoolName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
          </div>
          <div>
             <label className="block text-sm text-slate-400 mb-1">اسم الأستاذ</label>
             <input type="text" value={teacherName} onChange={e=>setTeacherName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
          </div>
          <div>
             <label className="block text-sm text-slate-400 mb-1">العام الدراسي</label>
             <input type="text" value={academicYear} onChange={e=>setAcademicYear(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
          </div>
          <div className="pt-4 border-t border-slate-700">
             <label className="block text-sm text-slate-400 mb-1">تغيير كلمة المرور</label>
             <input type="password" placeholder="السري الجديد..." value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
          </div>
          <button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl flex items-center justify-center space-x-2 space-x-reverse transition-colors">
            <Save size={18} /> <span>حفظ التغييرات</span>
          </button>
        </div>

        <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 space-y-4">
           <h3 className="font-medium text-lg text-white mb-2">النسخ الاحتياطي والاستعادة - الإصدار 1.1</h3>
           <p className="text-sm text-slate-400 mb-4">قم بتصدير جميع بياناتك بلا إنترنت كنسخة احتياطية آمنة (JSON). يمكنك استعادتها في أي وقت على هذا الجهاز أو غيره.</p>
           
           <div className="flex flex-col sm:flex-row gap-3">
             <button onClick={handleExport} className="flex-1 bg-slate-900 border border-slate-600 hover:border-emerald-500 hover:text-emerald-400 text-slate-300 font-medium py-3 rounded-xl flex items-center justify-center space-x-2 space-x-reverse transition-colors">
                <Download size={18} /> <span>تصدير نسخة كاملة</span>
             </button>
             
             <label className="flex-1 bg-slate-900 border border-slate-600 hover:border-orange-500 hover:text-orange-400 text-slate-300 font-medium py-3 rounded-xl flex items-center justify-center space-x-2 space-x-reverse transition-colors cursor-pointer">
                <Upload size={18} /> <span>استعادة نسخة احتياطية</span>
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
             </label>
           </div>
        </div>
      </div>
    </div>
  );
}
