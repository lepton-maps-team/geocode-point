import type { PlaceSuggestion } from "../../lib/googlePlaces";
import IconSearch from "../icons/IconSearch";
import IconX from "../icons/IconX";

type Coordinates = {
  lat: number;
  lng: number;
};

export type SearchSuggestion = PlaceSuggestion & {
  coordinates?: Coordinates;
};

type Props = {
  searchInput: string;
  onSearchInputChange: (next: string) => void;
  onClearSearch: () => void;
  isSearching: boolean;
  suggestions: SearchSuggestion[];
  onSuggestionSelect: (suggestion: SearchSuggestion) => void;
};

export default function FloatingSearchPanel({
  searchInput,
  onSearchInputChange,
  onClearSearch,
  isSearching,
  suggestions,
  onSuggestionSelect,
}: Props) {
  const hasSuggestions = suggestions.length > 0;

  return (
    <div
      className={`search-container floating-search-container${hasSuggestions ? " has-suggestions" : ""}`}
      id="search-container">
      <span className="search-icon">
        <IconSearch />
      </span>
      <input
        id="search-input"
        value={searchInput}
        onChange={(e) => onSearchInputChange(e.target.value)}
        placeholder="Search by address, locality, POI, or pincode..."
        className="search-field"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={hasSuggestions}
        aria-controls="suggestions-list"
      />
      {searchInput && (
        <button
          className="search-clear-btn"
          onClick={onClearSearch}
          title="Clear search"
          type="button">
          <IconX />
        </button>
      )}
      {isSearching && <div className="search-spinner" />}
      {hasSuggestions && (
        <div className="suggestions-dropdown" id="suggestions-list" role="listbox">
          <ul aria-label="Search suggestions">
            {suggestions.map((s) => (
              <li
                key={`${s.placeId ?? s.content}-${s.coordinates?.lat ?? ""}-${s.coordinates?.lng ?? ""}`}>
                <button
                  type="button"
                  className="suggestion-btn"
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSuggestionSelect(s)}>
                  <span className="title">{s.title}</span>
                  <span className="subtitle">{s.content}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

