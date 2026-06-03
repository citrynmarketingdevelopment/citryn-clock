import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const String apiBaseUrl =
    String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');

void main() {
  runApp(const CitrynClockApp());
}

class CitrynClockApp extends StatelessWidget {
  const CitrynClockApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Citryn Clock',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F766E)),
        useMaterial3: true,
      ),
      home: const LoginScreen(),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': _emailController.text.trim(),
          'password': _passwordController.text,
          'client': 'mobile',
        }),
      );

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode != 200) {
        setState(() => _error = (data['error'] as String?) ?? 'Login failed.');
        return;
      }

      final user = data['user'] as Map<String, dynamic>;
      if ((user['role'] as String?) == 'ADMIN') {
        setState(() => _error = 'Admin accounts should use the web dashboard.');
        return;
      }

      final token = data['token'] as String;
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => EmployeeScreen(
            token: token,
            employeeName: (user['name'] as String?) ?? 'Employee',
            employeeEmail: (user['email'] as String?) ?? '',
          ),
        ),
      );
    } catch (_) {
      setState(() => _error = 'Network error. Check API base URL.');
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Citryn Clock Login')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _login,
                child: Text(_loading ? 'Signing in...' : 'Sign in'),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 20),
            Text('API: $apiBaseUrl', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class EmployeeScreen extends StatefulWidget {
  const EmployeeScreen({
    super.key,
    required this.token,
    required this.employeeName,
    required this.employeeEmail,
  });

  final String token;
  final String employeeName;
  final String employeeEmail;

  @override
  State<EmployeeScreen> createState() => _EmployeeScreenState();
}

class _EmployeeScreenState extends State<EmployeeScreen> {
  String? _error;
  bool _loading = true;
  bool _savingAction = false;
  DaySummary? _today;
  List<DaySummary> _history = [];

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Map<String, String> get _authHeaders => {
        'Authorization': 'Bearer ${widget.token}',
        'Content-Type': 'application/json',
      };

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final todayRes = await http.get(
        Uri.parse('$apiBaseUrl/api/time/today'),
        headers: _authHeaders,
      );
      final todayData = jsonDecode(todayRes.body) as Map<String, dynamic>;
      if (todayRes.statusCode != 200) {
        setState(() => _error = (todayData['error'] as String?) ?? 'Failed to load today.');
        return;
      }

      final historyRes = await http.get(
        Uri.parse('$apiBaseUrl/api/time/history?days=14'),
        headers: _authHeaders,
      );
      final historyData = jsonDecode(historyRes.body) as Map<String, dynamic>;
      if (historyRes.statusCode != 200) {
        setState(() => _error = (historyData['error'] as String?) ?? 'Failed to load history.');
        return;
      }

      final summaries = (historyData['summaries'] as List<dynamic>)
          .map((item) => DaySummary.fromJson(item as Map<String, dynamic>))
          .toList();

      setState(() {
        _today = DaySummary.fromJson(todayData['summary'] as Map<String, dynamic>);
        _history = summaries;
      });
    } catch (_) {
      setState(() => _error = 'Network error while loading data.');
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _postAction(String action) async {
    setState(() {
      _savingAction = true;
      _error = null;
    });

    try {
      final response = await http.post(
        Uri.parse('$apiBaseUrl/api/time/action'),
        headers: _authHeaders,
        body: jsonEncode({'action': action}),
      );
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode != 200) {
        setState(() => _error = (data['error'] as String?) ?? 'Unable to save action.');
        return;
      }
      await _refresh();
    } catch (_) {
      setState(() => _error = 'Network error while saving action.');
    } finally {
      if (mounted) {
        setState(() => _savingAction = false);
      }
    }
  }

  List<String> _availableActions() {
    if (_today == null) return [];
    switch (_today!.status) {
      case 'OUT':
        return ['CLOCK_IN'];
      case 'WORKING':
        return ['BREAK_START', 'CLOCK_OUT'];
      case 'ON_BREAK':
        return ['BREAK_END', 'CLOCK_OUT'];
      default:
        return [];
    }
  }

  String _fmtDate(String day) {
    final parts = day.split('-');
    if (parts.length != 3) {
      return day;
    }

    final year = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    final date = int.tryParse(parts[2]);
    if (year == null || month == null || date == null) {
      return day;
    }

    return DateTime(year, month, date).toString().split(' ').first;
  }

  String _fmtDateTime(String? iso) {
    if (iso == null) return '-';
    final dt = DateTime.parse(iso).toLocal();
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  String _hours(int minutes) {
    final hours = minutes ~/ 60;
    final rest = minutes % 60;
    return '${hours}h ${rest}m';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Employee Time Clock'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.employeeName, style: Theme.of(context).textTheme.titleLarge),
                          Text(widget.employeeEmail),
                          const SizedBox(height: 10),
                          Text('Status: ${_today?.status ?? '-'}'),
                          Text('Worked today: ${_hours(_today?.workedMinutes ?? 0)}'),
                          Text('Break today: ${_hours(_today?.breakMinutes ?? 0)}'),
                          Text('First in: ${_fmtDateTime(_today?.firstClockIn)}'),
                          Text('Last out: ${_fmtDateTime(_today?.lastClockOut)}'),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _availableActions()
                        .map(
                          (action) => ElevatedButton(
                            onPressed: _savingAction ? null : () => _postAction(action),
                            child: Text(action.replaceAll('_', ' ')),
                          ),
                        )
                        .toList(),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                  ],
                  const SizedBox(height: 18),
                  Text('Last 14 days', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ..._history.map(
                    (row) => Card(
                      child: ListTile(
                        title: Text(_fmtDate(row.day)),
                        subtitle: Text(
                          'In: ${_fmtDateTime(row.firstClockIn)} | Out: ${_fmtDateTime(row.lastClockOut)}\n'
                          'Worked: ${_hours(row.workedMinutes)} | Break: ${_hours(row.breakMinutes)}',
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class DaySummary {
  DaySummary({
    required this.day,
    required this.firstClockIn,
    required this.lastClockOut,
    required this.workedMinutes,
    required this.breakMinutes,
    required this.status,
  });

  factory DaySummary.fromJson(Map<String, dynamic> json) {
    return DaySummary(
      day: json['day'] as String,
      firstClockIn: json['firstClockIn'] as String?,
      lastClockOut: json['lastClockOut'] as String?,
      workedMinutes: (json['workedMinutes'] as num?)?.toInt() ?? 0,
      breakMinutes: (json['breakMinutes'] as num?)?.toInt() ?? 0,
      status: (json['status'] as String?) ?? 'OUT',
    );
  }

  final String day;
  final String? firstClockIn;
  final String? lastClockOut;
  final int workedMinutes;
  final int breakMinutes;
  final String status;
}
