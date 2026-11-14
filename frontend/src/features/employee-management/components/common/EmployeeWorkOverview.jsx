import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useLoad } from '../../hooks/useLoad.js';
import { workService } from '../../services/workService.js';
import { employeeScreenPath } from '../../services/portalPaths.js';
import '../../pages/employee/workManagement.css';

export function EmployeeWorkOverview({ user }) {
  const { data, loading, error, reload } = useLoad(() => workService.list(false), [], { keepPreviousData: true });
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') reload(); };
    const timer = setInterval(refresh, 20000);
    window.addEventListener('employee:work-changed', refresh);
    return () => { clearInterval(timer); window.removeEventListener('employee:work-changed', refresh); };
  }, [reload]);
  const summary = data?.summary;
  return <section className="employee-work-overview" aria-label="Work overview">
    <div><span className="work-eyebrow">Your responsibilities</span><h2>My Work</h2>
      {error ? <p role="alert">Work could not be loaded. <button className="work-button" type="button" onClick={reload}>Try again</button></p> : loading && !summary ? <p role="status">Loading your work…</p> : <>
        <p>{summary?.assigned ?? 0} assigned · {summary?.inProgress ?? 0} in progress · {summary?.completed ?? 0} completed</p>
        {summary?.total ? <ul className="employee-work-preview">{(data?.data || []).slice(0, 3).map((task) => <li key={task._id}><Link to={employeeScreenPath(user, 'work')}>{task.title}</Link><span>{task.status}</span></li>)}</ul> : <p>New assignments from your administrator will appear here.</p>}
      </>}
    </div><Link className="work-button" to={employeeScreenPath(user, 'work')}>View My Work<ArrowUpRight size={16} /></Link>
  </section>;
}
