//! Most strona → powłoka: komunikaty `app:` strony Artist (biała lista, limity).
//! Strona nie dostaje dostępu do systemu: może zmienić tytuł własnego okna, stan pozycji menu,
//! zdecydować o zamknięciu własnego okna, zapisać kopię roboczą w katalogu powłoki pod nazwą z skrótu
//! i zadać pytanie w systemowym oknie dialogowym (tekst i 1–3 przyciski; odpowiedź: numer przycisku).

use std::path::PathBuf;

use serde_json::Value;

const MAX_TITLE: usize = 200;
const MAX_ID: usize = 128;
/// Największa kopia robocza sceny.
pub const MAX_DRAFT: usize = 16 * 1024 * 1024;
/// Okno dialogowe: treść (znaki), etykieta przycisku (znaki), przyciski.
const MAX_TEXT: usize = 4000;
const MAX_BUTTON: usize = 40;
const MAX_BUTTONS: usize = 3;

/// Ikona systemowego okna dialogowego.
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Kind {
    Info,
    Warning,
    Error,
}

#[derive(Debug, PartialEq)]
pub enum Msg {
    State {
        title: String,
        dirty: bool,
        undo: bool,
        redo: bool,
        scene: Option<String>,
    },
    /// Użytkownik zgodził się zamknąć okno.
    Close,
    /// Użytkownik został w oknie.
    Stay,
    Draft {
        id: String,
        data: Option<String>,
    },
    /// Pytanie w systemowym oknie dialogowym; pierwszy przycisk jest domyślny, ostatni to „anuluj”.
    Dialog {
        id: u32,
        kind: Kind,
        title: String,
        text: String,
        buttons: Vec<String>,
    },
}

fn clean(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(max).collect()
}

/// Tekst wielowierszowy: znaki sterujące poza końcem wiersza i tabulacją znikają.
fn clean_text(s: &str, max: usize) -> String {
    s.chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .take(max)
        .collect()
}

pub fn parse(body: &str) -> Option<Msg> {
    let v: Value = serde_json::from_str(body).ok()?;
    let id = || {
        v["id"]
            .as_str()
            .filter(|i| !i.is_empty() && i.len() <= MAX_ID)
            .map(String::from)
    };
    let b = |k: &str| v[k].as_bool().unwrap_or(false);
    match v["t"].as_str()? {
        "state" => Some(Msg::State {
            title: clean(v["title"].as_str()?, MAX_TITLE),
            dirty: b("dirty"),
            undo: b("undo"),
            redo: b("redo"),
            scene: v["scene"]
                .as_str()
                .filter(|s| s.len() <= MAX_ID)
                .map(String::from),
        }),
        "close" => Some(Msg::Close),
        "stay" => Some(Msg::Stay),
        "draft" => {
            let data = match &v["data"] {
                Value::Null => None,
                Value::String(s) if s.len() <= MAX_DRAFT => Some(s.clone()),
                _ => return None,
            };
            Some(Msg::Draft { id: id()?, data })
        }
        "dialog" => {
            let text = v["text"].as_str()?;
            if text.chars().count() > MAX_TEXT {
                return None;
            }
            let list = v["buttons"].as_array()?;
            if list.is_empty() || list.len() > MAX_BUTTONS {
                return None;
            }
            let mut buttons: Vec<String> = Vec::with_capacity(list.len());
            for b in list {
                let b = clean(b.as_str()?, MAX_BUTTON + 1);
                // pusta, za długa albo powtórzona etykieta: wynik okna nie wskazałby przycisku
                if b.trim().is_empty() || b.chars().count() > MAX_BUTTON || buttons.contains(&b) {
                    return None;
                }
                buttons.push(b);
            }
            Some(Msg::Dialog {
                id: u32::try_from(v["id"].as_u64()?).ok()?,
                kind: match v["kind"].as_str().unwrap_or("info") {
                    "warning" => Kind::Warning,
                    "error" => Kind::Error,
                    _ => Kind::Info,
                },
                title: clean(v["title"].as_str().unwrap_or(""), MAX_TITLE),
                text: clean_text(text, MAX_TEXT),
                buttons,
            })
        }
        _ => None,
    }
}

/// Plik kopii roboczej: nazwa to skrót serwera i sceny, więc identyfikator ze strony nie wskaże ścieżki.
pub fn draft_path(base: &str, id: &str) -> PathBuf {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in base.bytes().chain([0]).chain(id.bytes()) {
        h = (h ^ b as u64).wrapping_mul(0x0000_0100_0000_01b3);
    }
    crate::paths::state_dir()
        .join("drafts")
        .join(format!("{h:016x}.json"))
}

/// Kod Base64 fragmentu pliku przekazywanego stronie.
pub fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16
            | (*c.get(1).unwrap_or(&0) as u32) << 8
            | *c.get(2).unwrap_or(&0) as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 {
            T[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if c.len() > 2 {
            T[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_and_bad_messages_are_ignored() {
        assert_eq!(parse("śmieci"), None);
        assert_eq!(parse(r#"{"t":"connect","url":"http://zly"}"#), None);
        assert_eq!(parse(r#"{"t":"draft","id":"","data":"x"}"#), None);
        assert_eq!(parse(r#"{"t":"draft","id":"a","data":5}"#), None);
        let big = format!(
            r#"{{"t":"draft","id":"a","data":"{}"}}"#,
            "x".repeat(MAX_DRAFT + 1)
        );
        assert_eq!(parse(&big), None);
    }

    #[test]
    fn title_is_cleaned() {
        let m = parse(r#"{"t":"state","title":"a\nb","dirty":true}"#).unwrap();
        assert_eq!(
            m,
            Msg::State {
                title: "ab".into(),
                dirty: true,
                undo: false,
                redo: false,
                scene: None
            }
        );
    }

    #[test]
    fn dialog_limits() {
        let m = parse(
            r#"{"t":"dialog","id":7,"kind":"warning","title":"T\u0007","text":"a\nb\u0000","buttons":["Zapisz","Nie zapisuj","Anuluj"]}"#,
        )
        .unwrap();
        assert_eq!(
            m,
            Msg::Dialog {
                id: 7,
                kind: Kind::Warning,
                title: "T".into(),
                text: "a\nb".into(),
                buttons: vec!["Zapisz".into(), "Nie zapisuj".into(), "Anuluj".into()],
            }
        );
        let bad = [
            r#"{"t":"dialog","id":1,"text":"x","buttons":[]}"#,
            r#"{"t":"dialog","id":1,"text":"x","buttons":["a","b","c","d"]}"#,
            r#"{"t":"dialog","id":1,"text":"x","buttons":["a","a"]}"#,
            r#"{"t":"dialog","id":1,"text":"x","buttons":[" "]}"#,
            r#"{"t":"dialog","id":1,"text":"x","buttons":[5]}"#,
            r#"{"t":"dialog","id":-1,"text":"x","buttons":["a"]}"#,
            r#"{"t":"dialog","id":4294967296,"text":"x","buttons":["a"]}"#,
            r#"{"t":"dialog","id":1,"buttons":["a"]}"#,
        ];
        for b in bad {
            assert_eq!(parse(b), None, "{b}");
        }
        let long = format!(
            r#"{{"t":"dialog","id":1,"text":"{}","buttons":["a"]}}"#,
            "x".repeat(MAX_TEXT + 1)
        );
        assert_eq!(parse(&long), None);
        let btn = format!(
            r#"{{"t":"dialog","id":1,"text":"x","buttons":["{}"]}}"#,
            "x".repeat(MAX_BUTTON + 1)
        );
        assert_eq!(parse(&btn), None);
    }

    #[test]
    fn draft_name_never_follows_id() {
        let p = draft_path("http://h", "../../etc/passwd");
        assert_eq!(p.parent().unwrap().file_name().unwrap(), "drafts");
        assert_ne!(p, draft_path("http://g", "../../etc/passwd"));
    }

    #[test]
    fn base64_vectors() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
    }
}
