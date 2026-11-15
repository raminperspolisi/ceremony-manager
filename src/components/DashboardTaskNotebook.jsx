import React, { useCallback, useEffect, useState } from 'react';
import { deleteRows, insertRows, readTable, updateRows } from '../offlineSync';
import { formatDashboardDate } from '../dashboardUtils';
import { createWorkspaceTaskReminderTimestamp, formatReminderTimestamp } from '../telegramReminderUtils';
import { gregorianISOToJalali } from '../calendarDateUtils';
import { formatDisplay, formatPersianDigits } from '../styles';
import { supabase } from '../supabaseClient';
import { useToast } from './useToast';
import PersianDateInput from './PersianDateInput';
import './DashboardTaskNotebook.css';

const TASK_TABLE = 'workspace_tasks';

export default function DashboardTaskNotebook({ organizationId }) {
  const { confirm, toast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [telegramReminderDate, setTelegramReminderDate] = useState('');
  const [telegramReminderTime, setTelegramReminderTime] = useState('09:00');
  const [telegramReminderEnabled, setTelegramReminderEnabled] = useState(false);
  const [telegramReminders, setTelegramReminders] = useState([]);
  const [activeReminderTaskId, setActiveReminderTaskId] = useState(null);
  const [taskReminderDate, setTaskReminderDate] = useState('');
  const [taskReminderTime, setTaskReminderTime] = useState('09:00');
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramReminderLoading, setTelegramReminderLoading] = useState(false);
  const [deletingReminderId, setDeletingReminderId] = useState(null);
  const [telegramErrorMessage, setTelegramErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const loadTasks = useCallback(async () => {
    const { data, error } = await readTable(TASK_TABLE, {
      orderBy: 'created_at',
      ascending: false,
    });
    if (error) {
      setErrorMessage(`بارگذاری دفترچهٔ کارها ناموفق بود: ${error.message}`);
    } else {
      const sortedTasks = [...(data || [])].sort((first, second) => (
        Number(first.completed) - Number(second.completed)
        || String(second.created_at || '').localeCompare(String(first.created_at || ''))
      ));
      setTasks(sortedTasks);
      setErrorMessage('');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadTasks(); }, 0);
    window.addEventListener('offline-data-updated', loadTasks);
    window.addEventListener('focus', loadTasks);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('offline-data-updated', loadTasks);
      window.removeEventListener('focus', loadTasks);
    };
  }, [loadTasks]);

  useEffect(() => {
    if (!isOpen || !organizationId) return undefined;
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('list_telegram_workspace_task_reminders', {
          p_organization_id: organizationId,
        });
        if (error) throw error;
        if (!data || typeof data.connected !== 'boolean' || !Array.isArray(data.reminders)) {
          throw new Error('پاسخ وضعیت اعلان‌های تلگرام معتبر نیست.');
        }
        if (active) {
          setTelegramConnected(data.connected);
          setTelegramReminders(data.reminders);
        }
      } catch (error) {
        if (active) setTelegramErrorMessage(`بررسی اعلان‌های تلگرام ناموفق بود: ${error.message}`);
      } finally {
        if (active) setTelegramReminderLoading(false);
      }
    })();
    return () => { active = false; };
  }, [isOpen, organizationId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) {
        setIsOpen(false);
        setIsFormOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving]);

  const handleAddTask = async (event) => {
    event.preventDefault();
    const taskTitle = title.trim();
    if (!taskTitle) {
      setErrorMessage('عنوان کار را وارد کنید.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    try {
      let createdTask;
      if (telegramReminderEnabled) {
        if (!telegramConnected) throw new Error('ابتدا تلگرام را از بخش پروفایل به فضای کاری وصل کنید.');
        if (!navigator.onLine) throw new Error('برای ثبت اعلان تلگرام اتصال اینترنت لازم است.');
        if (!telegramReminderDate) throw new Error('تاریخ اعلان را انتخاب کنید.');
        const remindAt = createWorkspaceTaskReminderTimestamp(
          gregorianISOToJalali(telegramReminderDate),
          telegramReminderTime,
        );
        const { data, error } = await supabase.rpc('create_workspace_task_with_telegram_reminder', {
          p_organization_id: organizationId,
          p_title: taskTitle,
          p_notes: notes.trim() || null,
          p_remind_at: remindAt,
        });
        if (error) throw new Error(error.message);
        if (!data?.task || !data?.reminder) {
          throw new Error('پاسخ ثبت کار و اعلان معتبر نیست.');
        }
        createdTask = data.task;
        setTelegramReminders((current) => [
          ...current.filter((reminder) => reminder.task_id !== data.reminder.task_id),
          data.reminder,
        ].sort((first, second) => first.remind_at.localeCompare(second.remind_at)));
      } else {
        const { data, error } = await insertRows(TASK_TABLE, [{
          title: taskTitle,
          notes: notes.trim() || null,
          completed: false,
        }]);
        if (error) throw new Error(error.message);
        createdTask = data?.[0];
        if (!createdTask) throw new Error('پاسخ ثبت کار معتبر نیست.');
      }
      setTasks((current) => [createdTask, ...current]);
      setTitle('');
      setNotes('');
      setTelegramReminderDate('');
      setTelegramReminderTime('09:00');
      setTelegramReminderEnabled(false);
      setIsFormOpen(false);
      toast('success', telegramReminderEnabled
        ? 'کار و اعلان تلگرام زمان‌بندی‌شده ثبت شدند.'
        : 'کار به دفترچه اضافه شد.');
    } catch (error) {
      setErrorMessage(`افزودن کار ناموفق بود: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTask = async (task) => {
    setErrorMessage('');
    const completed = !task.completed;
    try {
      const { error } = await updateRows(TASK_TABLE, { completed }, [
        { column: 'id', operator: 'eq', value: task.id },
      ]);
      if (error) throw new Error(error.message);
      setTasks((current) => [...current.map((item) => (
        item.id === task.id ? { ...item, completed } : item
      ))].sort((first, second) => (
        Number(first.completed) - Number(second.completed)
        || String(second.created_at || '').localeCompare(String(first.created_at || ''))
      )));
      if (completed) {
        setTelegramReminders((current) => current.filter((reminder) => reminder.task_id !== task.id));
        if (activeReminderTaskId === task.id) setActiveReminderTaskId(null);
      }
    } catch (error) {
      setErrorMessage(`به‌روزرسانی کار ناموفق بود: ${error.message}`);
    }
  };

  const handleScheduleExistingTaskReminder = async (event, task) => {
    event.preventDefault();
    setSaving(true);
    setTelegramErrorMessage('');
    try {
      const remindAt = createWorkspaceTaskReminderTimestamp(
        gregorianISOToJalali(taskReminderDate),
        taskReminderTime,
      );
      const { data, error } = await supabase.rpc('create_telegram_workspace_task_reminder', {
        p_organization_id: organizationId,
        p_task_id: task.id,
        p_remind_at: remindAt,
      });
      if (error) throw error;
      if (!data?.id || data.task_id !== task.id || !data.remind_at) {
        throw new Error('پاسخ ثبت اعلان معتبر نیست.');
      }
      setTelegramReminders((current) => [
        ...current.filter((reminder) => reminder.task_id !== task.id),
        data,
      ].sort((first, second) => first.remind_at.localeCompare(second.remind_at)));
      setActiveReminderTaskId(null);
      setTaskReminderDate('');
      setTaskReminderTime('09:00');
      toast('success', 'اعلان تلگرام زمان‌بندی شد.');
    } catch (error) {
      setTelegramErrorMessage(`زمان‌بندی اعلان ناموفق بود: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTelegramReminder = async (reminder) => {
    if (!await confirm('اعلان تلگرام این کار حذف شود؟')) return;
    setTelegramErrorMessage('');
    setDeletingReminderId(reminder.id);
    try {
      const { data, error } = await supabase.rpc('delete_telegram_workspace_task_reminder', {
        p_organization_id: organizationId,
        p_reminder_id: reminder.id,
      });
      if (error) throw error;
      if (!data) throw new Error('اعلان حذف نشد؛ شاید قبلاً ارسال شده باشد.');
      setTelegramReminders((current) => current.filter((item) => item.id !== reminder.id));
    } catch (error) {
      setTelegramErrorMessage(`حذف اعلان تلگرام ناموفق بود: ${error.message}`);
    } finally {
      setDeletingReminderId(null);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!await confirm(`کار «${task.title}» حذف شود؟`)) return;
    setErrorMessage('');
    try {
      const { error } = await deleteRows(TASK_TABLE, [
        { column: 'id', operator: 'eq', value: task.id },
      ]);
      if (error) throw new Error(error.message);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setTelegramReminders((current) => current.filter((reminder) => reminder.task_id !== task.id));
      toast('success', 'کار از دفترچه حذف شد.');
    } catch (error) {
      setErrorMessage(`حذف کار ناموفق بود: ${error.message}`);
    }
  };

  const pendingCount = tasks.filter((task) => !task.completed).length;
  const openNotebook = () => {
    setTelegramReminderLoading(Boolean(organizationId));
    setTelegramErrorMessage('');
    setIsOpen(true);
    if (!organizationId) {
      setTelegramErrorMessage('فضای کاری برای بارگذاری تنظیمات اعلان پیدا نشد.');
    }
  };
  const closeModal = () => {
    if (saving) return;
    setIsOpen(false);
    setIsFormOpen(false);
    setActiveReminderTaskId(null);
  };

  return (
    <>
      <section className="home-metric-card home-metric-notebook" aria-labelledby="dashboard-task-notebook-title">
        <button
          type="button"
          className="home-notebook-summary"
          onClick={openNotebook}
          aria-label={`مشاهدهٔ دفترچهٔ کارها، ${formatDisplay(pendingCount)} کار باقی‌مانده`}
        >
          <span className="home-notebook-heading">
            <strong id="dashboard-task-notebook-title">دفترچهٔ کارها</strong>
            <span>یادداشت مشترک فضای کاری</span>
          </span>
          <strong className="home-notebook-count">{formatDisplay(pendingCount)}</strong>
          <small className="home-notebook-subtitle">کار باقی‌مانده</small>
        </button>
        <button
          type="button"
          className="home-notebook-add"
          onClick={() => {
            openNotebook();
            setIsFormOpen(true);
          }}
        >
          افزودن کار
        </button>
      </section>

      {isOpen && (
        <div
          className="home-notebook-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="home-notebook-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-notebook-modal-title"
            dir="rtl"
          >
            <header className="home-notebook-modal-header">
              <div>
                <h3 id="home-notebook-modal-title">دفترچهٔ کارها</h3>
                <p>{formatDisplay(pendingCount)} کار باقی‌مانده</p>
              </div>
              <button type="button" onClick={closeModal} disabled={saving} aria-label="بستن دفترچهٔ کارها">×</button>
            </header>

            {errorMessage && <p className="home-notebook-error" role="alert">{errorMessage}</p>}
            {telegramErrorMessage && <p className="home-notebook-error" role="alert">{telegramErrorMessage}</p>}
            {telegramReminderLoading ? (
              <p className="home-notebook-telegram-status" role="status">در حال بررسی اتصال تلگرام…</p>
            ) : telegramConnected ? (
              <p className="home-notebook-telegram-status">اعلان‌ها به تلگرام متصل‌شدهٔ شما، در وقت تهران، ارسال می‌شوند.</p>
            ) : (
              <p className="home-notebook-telegram-status">برای زمان‌بندی اعلان، ابتدا تلگرام را از بخش پروفایل وصل کنید.</p>
            )}

            <button
              type="button"
              className="home-notebook-add"
              onClick={() => setIsFormOpen((current) => !current)}
            >
              {isFormOpen ? 'انصراف از افزودن' : 'افزودن کار'}
            </button>

            {isFormOpen && (
              <form className="home-notebook-form" onSubmit={handleAddTask}>
                <label>
                  عنوان کار
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="چه کاری باید انجام شود؟"
                    maxLength={180}
                    required
                    disabled={saving}
                  />
                </label>
                <label>
                  یادداشت کار (اختیاری)
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="یادداشت یا جزئیات (اختیاری)"
                    maxLength={2000}
                    rows={2}
                    disabled={saving}
                  />
                </label>
                <button
                  type="button"
                  className="home-notebook-telegram-toggle"
                  onClick={() => setTelegramReminderEnabled((current) => !current)}
                  disabled={saving || telegramReminderLoading || !telegramConnected}
                >
                  {telegramReminderEnabled ? 'حذف اعلان تلگرام' : 'زمان‌بندی اعلان تلگرام'}
                </button>
                {telegramReminderEnabled && (
                  <div className="home-notebook-telegram-fields">
                    <label>
                      تاریخ اعلان (شمسی)
                      <PersianDateInput
                        className="home-notebook-telegram-date"
                        value={telegramReminderDate}
                        onChange={setTelegramReminderDate}
                        disabled={saving}
                        required
                      />
                    </label>
                    <label>
                      ساعت اعلان
                      <input
                        type="time"
                        value={telegramReminderTime}
                        onChange={(event) => setTelegramReminderTime(event.target.value)}
                        disabled={saving}
                        required
                      />
                    </label>
                  </div>
                )}
                <button type="submit" disabled={saving || !title.trim()}>
                  {saving ? 'در حال افزودن…' : 'ثبت کار'}
                </button>
              </form>
            )}

            {loading ? (
              <div className="home-dashboard-skeleton" role="status" aria-label="در حال بارگذاری کارها"><span /><span /></div>
            ) : tasks.length === 0 ? (
              <div className="home-notebook-empty">هنوز کاری ثبت نشده است.</div>
            ) : (
              <ul className="home-notebook-list">
                {tasks.map((task) => (
                  <li className={`home-notebook-item${task.completed ? ' is-completed' : ''}`} key={task.id}>
                    <label className="home-notebook-task">
                      <input
                        type="checkbox"
                        checked={Boolean(task.completed)}
                        onChange={() => { void handleToggleTask(task); }}
                        aria-label={task.completed ? `علامت‌زدن ${task.title} به‌عنوان انجام‌نشده` : `علامت‌زدن ${task.title} به‌عنوان انجام‌شده`}
                      />
                      <span className="home-notebook-task-content">
                        <strong>{task.title}</strong>
                        {task.notes && <small>{task.notes}</small>}
                        {task.created_at && <time dateTime={task.created_at}>{formatDashboardDate(task.created_at)}</time>}
                      </span>
                    </label>
                    <button type="button" className="home-notebook-delete" onClick={() => { void handleDeleteTask(task); }} aria-label={`حذف ${task.title}`}>
                      حذف
                    </button>
                    {!task.completed && telegramConnected && (
                      <button
                        type="button"
                        className="home-notebook-schedule-reminder"
                        onClick={() => {
                          setActiveReminderTaskId((current) => current === task.id ? null : task.id);
                          setTaskReminderDate('');
                          setTaskReminderTime('09:00');
                          setTelegramErrorMessage('');
                        }}
                        disabled={saving}
                      >
                        {telegramReminders.some((reminder) => reminder.task_id === task.id)
                          ? 'تغییر زمان اعلان'
                          : 'تنظیم اعلان تلگرام'}
                      </button>
                    )}
                    {telegramReminders.filter((reminder) => reminder.task_id === task.id).map((reminder) => (
                      <div className="home-notebook-telegram-reminder" key={reminder.id}>
                        <span>اعلان تلگرام: {formatPersianDigits(formatReminderTimestamp(reminder.remind_at))}</span>
                        <button
                          type="button"
                          onClick={() => { void handleDeleteTelegramReminder(reminder); }}
                          disabled={deletingReminderId === reminder.id}
                          aria-label={`حذف اعلان تلگرام ${task.title}`}
                        >
                          {deletingReminderId === reminder.id ? '…' : 'لغو'}
                        </button>
                      </div>
                    ))}
                    {activeReminderTaskId === task.id && (
                      <form
                        className="home-notebook-telegram-task-form"
                        onSubmit={(event) => { void handleScheduleExistingTaskReminder(event, task); }}
                      >
                        <label>
                          تاریخ اعلان (شمسی)
                          <PersianDateInput
                            className="home-notebook-telegram-date"
                            value={taskReminderDate}
                            onChange={setTaskReminderDate}
                            disabled={saving}
                            required
                          />
                        </label>
                        <label>
                          ساعت اعلان
                          <input
                            type="time"
                            value={taskReminderTime}
                            onChange={(event) => setTaskReminderTime(event.target.value)}
                            disabled={saving}
                            required
                          />
                        </label>
                        <button type="submit" disabled={saving || !taskReminderDate}>
                          {saving ? 'در حال ثبت…' : 'ثبت زمان اعلان'}
                        </button>
                        <button type="button" onClick={() => setActiveReminderTaskId(null)} disabled={saving}>
                          انصراف
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
