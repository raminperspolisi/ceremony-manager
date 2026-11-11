import React, { useCallback, useEffect, useState } from 'react';
import { deleteRows, insertRows, readTable, updateRows } from '../offlineSync';
import { formatDashboardDate } from '../dashboardUtils';
import { useToast } from './useToast';
import './DashboardTaskNotebook.css';

const TASK_TABLE = 'workspace_tasks';

export default function DashboardTaskNotebook() {
  const { confirm, toast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
      const { data, error } = await insertRows(TASK_TABLE, [{
        title: taskTitle,
        notes: notes.trim() || null,
        completed: false,
      }]);
      if (error) throw new Error(error.message);
      setTasks((current) => [...(data || []), ...current]);
      setTitle('');
      setNotes('');
      toast('success', 'کار به دفترچه اضافه شد.');
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
    } catch (error) {
      setErrorMessage(`به‌روزرسانی کار ناموفق بود: ${error.message}`);
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
      toast('success', 'کار از دفترچه حذف شد.');
    } catch (error) {
      setErrorMessage(`حذف کار ناموفق بود: ${error.message}`);
    }
  };

  const pendingCount = tasks.filter((task) => !task.completed).length;

  return (
    <section className="home-dashboard-card home-dashboard-notebook" aria-labelledby="dashboard-task-notebook-title">
      <div className="home-dashboard-card-heading">
        <div><span>یادداشت مشترک فضای کاری</span><h4 id="dashboard-task-notebook-title">دفترچهٔ کارها</h4></div>
        <span className="home-notebook-count">{pendingCount} کار باقی‌مانده</span>
      </div>

      {errorMessage && <p className="home-notebook-error" role="alert">{errorMessage}</p>}

      <form className="home-notebook-form" onSubmit={handleAddTask}>
        <label>
          <span className="sr-only">عنوان کار</span>
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
          <span className="sr-only">یادداشت کار (اختیاری)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="یادداشت یا جزئیات (اختیاری)"
            maxLength={2000}
            rows={2}
            disabled={saving}
          />
        </label>
        <button type="submit" disabled={saving || !title.trim()}>
          {saving ? 'در حال افزودن…' : 'افزودن به دفترچه'}
        </button>
      </form>

      {loading ? (
        <div className="home-dashboard-skeleton" role="status" aria-label="در حال بارگذاری کارها"><span /><span /></div>
      ) : tasks.length === 0 ? (
        <div className="home-notebook-empty">هنوز کاری ثبت نشده؛ می‌توانید اولین مورد را بالا اضافه کنید.</div>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
