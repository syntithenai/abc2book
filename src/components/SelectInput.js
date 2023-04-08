import React, { useState } from 'react';
import { Form, FormControl, InputGroup, Dropdown, DropdownButton } from 'react-bootstrap';

const SelectInput = ({ options, onChange, value }) => {
  const [selectedOption, setSelectedOption] = useState(value);
  const [inputValue, setInputValue] = useState(value);

  const handleInputChange = (event) => {
    setInputValue(event.target.value);
    onChange(event.target.value);
  };

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
    setInputValue(option);
    onChange(option);
  };

  const handleDropdownToggle = () => {
    setSelectedOption(null);
    //setInputValue('');
  };

  return (
    <InputGroup>
      {(Array.isArray(options) && options.length > 0) && <DropdownButton
        as={InputGroup.Append}
        variant="outline-secondary"
        title={options.length}
        onSelect={handleOptionSelect}
        onToggle={handleDropdownToggle}
      >
        {options.map((option) => (
          <Dropdown.Item key={option} eventKey={option}>
            {option}
          </Dropdown.Item>
        ))}
      </DropdownButton>}
      <FormControl
        value={inputValue}
        onChange={handleInputChange}
        placeholder="Type or select an option"
      />
      
    </InputGroup>
  );
};

export default SelectInput;
